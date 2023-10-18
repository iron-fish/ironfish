/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, isValidPublicAddress } from '@ironfish/rust-nodejs'
import {
  PromiseUtils,
  RawTransactionSerde,
  RpcConnectionError,
  RpcSocketClient,
  WebApi,
} from '@ironfish/sdk'
import { BurnDescription } from '@ironfish/sdk/src/primitives/burnDescription'
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

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.startSyncing(client, api, flags.account)
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

  async startSyncing(client: RpcSocketClient, api: WebApi, account?: string): Promise<void> {
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
      if (!(await this.walletIsReady(client, account))) {
        this.log('Wallet not ready, waiting 5s')
        await PromiseUtils.sleep(5000)
        continue
      }

      // TODO(hughy): balance transaction queueing
      await this.processNextReleaseTransaction(client, account, api)
      await this.processNextBurnTransaction(client, account, api)
      await this.processNextMintTransaction(client, account, api)
    }
  }

  async processNextReleaseTransaction(
    client: RpcSocketClient,
    account: string,
    api: WebApi,
  ): Promise<void> {
    const { requests: unprocessedReleaseRequests } = await api.getBridgeNextReleaseRequests(
      MAX_RECIPIENTS_PER_TRANSACTION,
    )

    if (unprocessedReleaseRequests.length === 0) {
      this.log('No release requests')
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
      this.log('Available balance too low to process release requests')
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

    this.log(
      `Release: ${JSON.stringify(
        requestsToProcess,
        ['id', 'destination_address', 'amount'],
        '   ',
      )} ${tx.content.hash}`,
    )

    const updatePayload = []
    for (const request of requestsToProcess) {
      updatePayload.push({
        id: request.id,
        destination_transaction: tx.content.hash,
        status: 'PENDING_DESTINATION_RELEASE_TRANSACTION_CONFIRMATION',
      })
    }

    await api.updateBridgeRequests(updatePayload)
  }

  async processNextBurnTransaction(
    client: RpcSocketClient,
    account: string,
    api: WebApi,
  ): Promise<void> {
    const { requests: nextBurnRequests } = await api.getBridgeNextBurnRequests(MAX_RECIPIENTS_PER_TRANSACTION)

    if (nextBurnRequests.length === 0) {
      this.log('No burn requests')
      return
    }

    const pendingRequests = []

    const balancesResponse = await client.wallet.getAccountBalances({ account })
    const availableBalances: Map<string, bigint> = new Map()
    for (const balance of balancesResponse.content.balances) {
      availableBalances.set(balance.assetId, BigInt(balance.available))
    }

    const burnDescriptions: Map<string, BurnDescription> = new Map()

    for (const request of nextBurnRequests) {
      const assetId = request.asset

      const availableBalance = availableBalances.get(assetId) ?? 0n

      const burnDescription = burnDescriptions.get(assetId) ?? {
        assetId: Buffer.from(assetId, 'hex'),
        value: 0n,
      }

      if (burnDescription.value + BigInt(request.amount) > availableBalance) {
        continue
      }

      burnDescription.value += BigInt(request.amount)
      burnDescriptions.set(assetId, burnDescription)
      pendingRequests.push(request)
    }

    if (burnDescriptions.size === 0) {
      this.log('Available balances too low to burn bridged assets')
      return
    }

    const burns = []
    for (const burn of burnDescriptions.values()) {
      burns.push({
        assetId: burn.assetId.toString('hex'),
        value: burn.value.toString(),
      })
    }

    const createTransactionResponse = await client.wallet.createTransaction({
      account,
      outputs: [],
      burns,
      fee: '1',
    })

    const tx = await client.wallet.postTransaction({
      account,
      transaction: createTransactionResponse.content.transaction,
      broadcast: true,
    })

    this.log(
      `Burn: ${JSON.stringify(pendingRequests, ['id', 'asset', 'amount'], '   ')} ${
        tx.content.hash
      }`,
    )

    const updatePayload = []
    for (const request of pendingRequests) {
      updatePayload.push({
        id: request.id,
        destination_transaction: tx.content.hash,
        status: 'PENDING_SOURCE_BURN_TRANSACTION_CONFIRMATION',
      })
    }

    await api.updateBridgeRequests(updatePayload)
  }

  async processNextMintTransaction(
    client: RpcSocketClient,
    account: string,
    api: WebApi,
  ): Promise<void> {
    const { requests: nextMintRequests } = await api.getBridgeNextMintRequests(1)
    if (nextMintRequests.length === 0) {
      this.log('No mint requests')
      return
    }

    const mintRequest = nextMintRequests[0]

    const createTransactionResponse = await client.wallet.createTransaction({
      account,
      outputs: [
        {
          amount: mintRequest.amount,
          assetId: mintRequest.asset,
          publicAddress: mintRequest.destination_address,
          memo: mintRequest.id.toString(),
        },
      ],
      mints: [
        {
          value: mintRequest.amount,
          assetId: mintRequest.asset,
        },
      ],
      fee: '1',
    })

    const bytes = Buffer.from(createTransactionResponse.content.transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(bytes)
    const mintTransactionResponse = await client.wallet.postTransaction({
      account,
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      broadcast: true,
    })

    this.log(
      `Mint:
        id: ${mintRequest.id}
        asset: ${mintRequest.asset}
        amount: ${mintRequest.amount}
        transaction: ${mintTransactionResponse.content.hash}`,
    )

    await api.updateBridgeRequests([
      {
        id: mintRequest.id,
        status: 'PENDING_SOURCE_MINT_TRANSACTION_CONFIRMATION',
        destination_transaction: mintTransactionResponse.content.hash,
      },
    ])
  }

  async walletIsReady(client: RpcSocketClient, account: string): Promise<boolean> {
    const status = await client.node.getStatus()

    if (!status.content.blockchain.synced) {
      this.log('Blockchain not synced')
      return false
    }

    if (!status.content.peerNetwork.isReady) {
      this.log('Peer network not ready')
      return false
    }

    const balance = await client.wallet.getAccountBalance({
      account,
      assetId: Asset.nativeId().toString('hex'),
    })

    if (BigInt(balance.content.available) <= 0n) {
      this.log('No balance available for transaction fees')
      return false
    }

    return true
  }
}
