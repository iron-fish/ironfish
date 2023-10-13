/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, isValidPublicAddress } from '@ironfish/rust-nodejs'
import { Meter, PromiseUtils, RpcConnectionError, RpcSocketClient, WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

const MAX_RECIPIENTS_PER_TRANSACTION = 10

export default class Release extends IronfishCommand {
  static hidden = true

  static description = `
    Release locked IRON to users from the bridge
  `

  static flags = {
    ...RemoteFlags,
    endpoint: Flags.string({
      char: 'e',
      description: 'API host to sync to',
      parse: (input: string) => Promise.resolve(input.trim()),
      env: 'IRONFISH_API_HOST',
    }),
    token: Flags.string({
      char: 't',
      description: 'API token to authenticate with',
      parse: (input: string) => Promise.resolve(input.trim()),
      env: 'IRONFISH_API_TOKEN',
    }),
    account: Flags.string({
      char: 'f',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account to send transactions from',
    }),
  }

  warnedFund = false

  async start(): Promise<void> {
    const { flags } = await this.parse(Release)

    if (!flags.endpoint) {
      this.log(
        `No api host set. You must set IRONFISH_API_HOST env variable or pass --endpoint flag.`,
      )
      this.exit(1)
    }

    if (!flags.token) {
      this.log(
        `No api token set. You must set IRONFISH_API_TOKEN env variable or pass --token flag.`,
      )
      this.exit(1)
    }

    const api = new WebApi({ host: flags.endpoint, token: flags.token })

    const client = this.sdk.client

    const speed = new Meter()

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.startSyncing(client, api, speed, flags.account)
      } catch (e) {
        if (e instanceof RpcConnectionError) {
          this.log('Connection error... retrying in 5 seconds')
          await PromiseUtils.sleep(5000)
          continue
        }

        throw e
      }
    }
  }

  async startSyncing(
    client: RpcSocketClient,
    api: WebApi,
    speed: Meter,
    account?: string,
  ): Promise<void> {
    const connected = await client.tryConnect()

    if (!connected) {
      this.log('Failed to connect, retrying in 5 seconds')
      await PromiseUtils.sleep(5000)
      return
    }

    if (!account) {
      this.log('Fetching bridge account')

      const response = await client.wallet.getDefaultAccount()

      if (!response.content.account) {
        this.error('Bridge node has no account to use')
      }

      account = response.content.account.name
    }

    this.log(`Using account ${account}`)

    while (client.isConnected) {
      speed.start()
      speed.reset()

      await this.processNextTransaction(client, account, speed, api)
    }
  }

  async processNextTransaction(
    client: RpcSocketClient,
    account: string,
    speed: Meter,
    api: WebApi,
  ): Promise<void> {
    const status = await client.node.getStatus()

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

    const unprocessedReleaseRequests = await api.getBridgeNextWIronRequests(
      MAX_RECIPIENTS_PER_TRANSACTION,
    )

    if (unprocessedReleaseRequests.length === 0) {
      this.log('No bridge requests, waiting 5s')
      await PromiseUtils.sleep(5000)
      return
    }

    const requestsToProcess = []
    let totalAmount = 0n

    const response = await client.wallet.getAccountBalance({ account })
    const availableBalance = BigInt(response.content.available)

    for (const request of unprocessedReleaseRequests) {
      if (!isValidPublicAddress(request.destination_address)) {
        // TODO (hughy): submit failed status back to bridge API
        continue
      }

      totalAmount += BigInt(request.amount) + 1n
      if (totalAmount > availableBalance) {
        this.log(
          `Bridge account only has available balance for ${requestsToProcess.length} transactions`,
        )
        break
      }

      requestsToProcess.push(request)
    }

    if (requestsToProcess.length === 0) {
      this.log('No bridge requests, waiting 5s')
      await PromiseUtils.sleep(5000)
      return
    }

    this.log(
      `Sending: ${JSON.stringify(
        requestsToProcess,
        ['id', 'destination_address', 'amount'],
        '   ',
      )}`,
    )

    const outputs = requestsToProcess.map((req) => {
      return {
        publicAddress: req.destination_address,
        amount: req.amount,
        memo: req.id.toString(),
        assetId: Asset.nativeId().toString('hex'),
      }
    })

    const tx = await client.wallet.sendTransaction({
      account,
      outputs,
      fee: BigInt(requestsToProcess.length).toString(),
    })

    speed.add(1)

    this.log(
      `Sent: ${JSON.stringify(
        requestsToProcess,
        ['id', 'destination_address', 'amount'],
        '   ',
      )} ${tx.content.hash} (5m avg ${speed.rate5m.toFixed(2)})`,
    )

    const updatePayload = []
    for (const request of requestsToProcess) {
      updatePayload.push({
        id: request.id,
        destination_transaction: tx.content.hash,
        status: 'PENDING_DESTINATION_RELEASE_TRANSACTION_CONFIRMATION',
      })
    }

    await api.updateWIronRequests(updatePayload)
  }
}
