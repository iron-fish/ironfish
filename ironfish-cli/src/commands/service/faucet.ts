/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConnectionError, IronfishIpcClient, Meter, PromiseUtils, WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

const FAUCET_AMOUNT = 5
const FAUCET_FEE = 1
const MAX_RECIPIENTS_PER_TRANSACTION = 50

export default class Faucet extends IronfishCommand {
  static hidden = true

  static description = `
    Create faucet transactions to an HTTP API using IronfishApi
  `

  static flags = {
    ...RemoteFlags,
    api: Flags.string({
      char: 'a',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'API host to sync to',
    }),
    token: Flags.string({
      char: 't',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'API host token to authenticate with',
    }),
  }

  warnedFund = false

  async start(): Promise<void> {
    const { flags } = await this.parse(Faucet)

    const apiHost = (flags.api || process.env.IRONFISH_API_HOST || '').trim()
    const apiToken = (flags.token || process.env.IRONFISH_API_TOKEN || '').trim()

    if (!apiHost) {
      this.log(
        `No api host found to upload blocks to. You must set IRONFISH_API_HOST env variable or pass --api flag.`,
      )
      this.exit(1)
    }

    if (!apiToken) {
      this.log(
        `No api token found to auth with the API. You must set IRONFISH_API_TOKEN env variable or pass --token flag.`,
      )
      this.exit(1)
    }

    this.log(`Connecting to node and API ${apiHost}`)

    const client = this.sdk.client
    const api = new WebApi({ host: apiHost, token: apiToken })
    const speed = new Meter()

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.startSyncing(client, api, speed)
      } catch (e) {
        if (e instanceof ConnectionError) {
          this.log('Connection error... retrying in 5 seconds')
          await PromiseUtils.sleep(5000)
          continue
        }

        throw e
      }
    }
  }

  async startSyncing(client: IronfishIpcClient, api: WebApi, speed: Meter): Promise<void> {
    const connected = await client.tryConnect()

    if (!connected) {
      this.log('Failed to connect, retrying in 5 seconds')
      await PromiseUtils.sleep(5000)
      return
    }

    this.log('Fetching faucet account')

    const response = await client.getDefaultAccount()
    const account = response.content.account?.name

    if (!account) {
      this.error('Faucet node has no account to use')
    }

    this.log(`Using account ${account}`)

    while (client.isConnected) {
      speed.start()
      speed.reset()

      await this.processNextTransaction(client, account, speed, api)
    }
  }

  async processNextTransaction(
    client: IronfishIpcClient,
    account: string,
    speed: Meter,
    api: WebApi,
  ): Promise<void> {
    const status = await client.status()

    if (!status.content.blockchain.synced) {
      this.log('Blockchain not synced, waiting 5s')
      await PromiseUtils.sleep(5000)
      return
    }

    if (!status.content.peerNetwork.isReady) {
      this.log('Peer network not ready, waiting 5s')
      await PromiseUtils.sleep(5000)
      return
    }

    let faucetTransactions = await api.getNextFaucetTransactions(MAX_RECIPIENTS_PER_TRANSACTION)

    if (faucetTransactions.length === 0) {
      this.log('No faucet jobs, waiting 5s')
      await PromiseUtils.sleep(5000)
      return
    }

    const response = await client.getAccountBalance({ account })

    if (BigInt(response.content.confirmed) < BigInt(FAUCET_AMOUNT + FAUCET_FEE)) {
      if (!this.warnedFund) {
        this.log(
          `Faucet has insufficient funds. Needs ${FAUCET_AMOUNT + FAUCET_FEE} but has ${
            response.content.confirmed
          }. Waiting on more funds.`,
        )

        this.warnedFund = true
      }

      await PromiseUtils.sleep(5000)
      return
    }

    this.warnedFund = false

    const maxPossibleRecipients = Math.min(
      Number(BigInt(response.content.confirmed) / BigInt(FAUCET_AMOUNT + FAUCET_FEE)),
      MAX_RECIPIENTS_PER_TRANSACTION,
    )

    faucetTransactions = faucetTransactions.slice(0, maxPossibleRecipients)

    this.log(
      `Starting ${JSON.stringify(
        faucetTransactions,
        ['id', 'public_key', 'started_at'],
        '   ',
      )}`,
    )

    for (const faucetTransaction of faucetTransactions) {
      await api.startFaucetTransaction(faucetTransaction.id)
    }

    const receives = faucetTransactions.map((ft) => {
      return {
        publicAddress: ft.public_key,
        amount: BigInt(FAUCET_AMOUNT).toString(),
        memo: `Faucet for ${ft.id}`,
      }
    })

    const tx = await client.sendTransaction({
      fromAccountName: account,
      receives,
      fee: BigInt(faucetTransactions.length * FAUCET_FEE).toString(),
    })

    speed.add(1)

    this.log(
      `COMPLETING: ${JSON.stringify(
        faucetTransactions,
        ['id', 'public_key', 'started_at'],
        '   ',
      )} ${tx.content.hash} (5m avg ${speed.rate5m.toFixed(2)})`,
    )

    for (const faucetTransaction of faucetTransactions) {
      await api.completeFaucetTransaction(faucetTransaction.id, tx.content.hash)
    }
  }
}
