/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  CreateTransactionRequest,
  CurrencyUtils,
  MAINNET,
  RawTransaction,
  RawTransactionSerde,
  RpcAsset,
  RpcClient,
  TESTNET,
  Transaction,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../../command'
import { HexFlag, IronFlag, RemoteFlags, ValueFlag } from '../../../flags'
import * as ui from '../../../ui'
import {
  ChainportBridgeTransaction,
  ChainportToken,
  ChainportTokenWithNetwork,
  fetchChainportBridgeTransaction,
  fetchChainportTokenPaths,
  fetchChainportTokens,
} from '../../../utils/chainport'
import { isEthereumAddress } from '../../../utils/chainport/address'
import { promptCurrency } from '../../../utils/currency'
import { promptExpiration } from '../../../utils/expiration'
import { getExplorer } from '../../../utils/explorer'
import { selectFee } from '../../../utils/fees'
import { watchTransaction } from '../../../utils/transaction'

export class BridgeCommand extends IronfishCommand {
  static description = `Use the Chainport bridge to bridge assets to EVM networks.`

  static flags = {
    ...RemoteFlags,
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed on Ironfish',
    }),
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to send the asset from',
    }),
    to: Flags.string({
      description: 'The Ethereum public address of the recipient',
    }),
    amount: ValueFlag({
      description: 'The amount of the asset in the major denomination',
      flagName: 'amount',
    }),
    assetId: HexFlag({
      description: 'The identifier for the asset to use when bridging',
    }),
    fee: IronFlag({
      description: 'The fee amount in IRON',
      minimum: 1n,
      flagName: 'fee',
    }),
    feeRate: IronFlag({
      description: 'The fee rate amount in IRON/Kilobyte',
      minimum: 1n,
      flagName: 'fee rate',
    }),
    expiration: Flags.integer({
      description:
        'The block sequence after which the transaction will be removed from the mempool. Set to 0 for no expiration.',
    }),
    offline: Flags.boolean({
      default: false,
      description: 'Allow offline transaction creation',
    }),
    unsignedTransaction: Flags.boolean({
      default: false,
      description:
        'Return a serialized UnsignedTransaction. Use it to create a transaction and build proofs but not post to the network',
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Send a transaction using a Ledger device',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(BridgeCommand)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    if (networkId !== TESTNET.id && networkId !== MAINNET.id) {
      this.error(`Chainport transactions are only available on testnet and mainnet.`)
    }

    if (!flags.offline) {
      const status = await client.wallet.getNodeStatus()

      if (!status.content.blockchain.synced) {
        this.error(
          `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
        )
      }
    }

    const { targetToken, from, to, amount, asset, assetData, expiration } =
      await this.getAndValidateInputs(client, networkId)

    const rawTransaction = await this.constructBridgeTransaction(
      client,
      networkId,
      targetToken,
      from,
      to,
      amount,
      asset,
      assetData,
      expiration,
    )

    if (flags.unsignedTransaction) {
      const response = await client.wallet.buildTransaction({
        account: from,
        rawTransaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      })
      this.log('Unsigned Bridge Transaction')
      this.log(response.content.unsignedTransaction)
      this.exit(0)
    }

    if (flags.ledger) {
      await ui.sendTransactionWithLedger(
        client,
        rawTransaction,
        from,
        flags.watch,
        true,
        this.logger,
      )
      this.exit(0)
    }

    await ui.confirmOrQuit()

    const postTransaction = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      account: from,
    })

    const bytes = Buffer.from(postTransaction.content.transaction, 'hex')
    const transaction = new Transaction(bytes)
    const hash = transaction.hash().toString('hex')

    if (postTransaction.content.accepted === false) {
      this.warn(`Transaction '${hash}' was not accepted into the mempool`)
    }

    const transactionUrl = getExplorer(networkId)?.getTransactionUrl(hash)

    if (transactionUrl) {
      this.log(`\nBlock explorer: ${transactionUrl}`)
    }

    if (flags.watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        account: from,
        hash,
      })
    } else {
      this.log(`Run ironfish wallet:transaction ${hash} to get the status of your transaction.`)
      this.log(
        `Run ironfish wallet:transaction:watch ${hash} to wait for the status of your transaction to be confirmed/ expired.`,
      )
    }
  }

  private async getAndValidateInputs(client: RpcClient, networkId: number) {
    const { flags } = await this.parse(BridgeCommand)

    let from = flags.account
    let to = flags.to
    let assetId = flags.assetId

    if (!from) {
      const response = await client.wallet.getDefaultAccount()

      if (!response.content.account) {
        this.error(
          `No account is currently active.
            Use ironfish wallet:create <name> to first create an account`,
        )
      }

      from = response.content.account.name
    }

    if (!to) {
      to = await ui.inputPrompt('Enter the public address of the recipient', true)
    }

    if (!isEthereumAddress(to)) {
      this.error('Invalid to ethereum address')
    }

    let expiration = flags.expiration

    if (flags.unsignedTransaction && expiration === undefined) {
      expiration = await promptExpiration({ logger: this.logger, client: client })
    }

    if (expiration !== undefined && expiration < 0) {
      this.error('Expiration sequence must be non-negative')
    }

    ux.action.start('Fetching bridgeable assets')
    const tokens = await fetchChainportTokens(networkId)
    ux.action.stop()

    const tokenNames = tokens.map(
      (t, index) => `${index + 1}. ${t.name} (${t.symbol}) - ${t.web3_address}`,
    )

    if (!assetId) {
      const asset = await ui.assetPrompt(client, from, {
        action: 'send',
        showNativeAsset: true,
        showNonCreatorAsset: true,
        showSingleAssetChoice: true,
        filter: (asset) => {
          return tokens.some((t) => t.web3_address === asset.id)
        },
      })

      if (!asset) {
        this.logger.error(
          `No supported Chainport asset found for this account. Here are the supported tokens: \n\n${tokenNames.join(
            '\n',
          )}\n`,
        )
        this.exit(1)
      }

      assetId = asset.id
    }

    const asset: ChainportToken | undefined = tokens.find((t) => t.web3_address === assetId)

    if (!asset) {
      this.logger.error(
        `Asset ${assetId} not supported by Chainport. Here are the supported tokens: \n\n${tokenNames.join(
          '\n',
        )}\n`,
      )
      this.exit(1)
    }

    const assetData = (
      await client.wallet.getAsset({
        account: from,
        id: assetId,
      })
    ).content

    if (assetData.verification.status === 'unverified') {
      assetData.verification.decimals = asset.decimals
      assetData.verification.symbol = asset.symbol
      assetData.verification.status = 'verified'
    }

    const targetToken = await this.selectTokenWithNetwork(networkId, asset)

    let amount
    if (flags.amount) {
      const [parsedAmount, error] = CurrencyUtils.tryMajorToMinor(
        flags.amount,
        assetId,
        assetData.verification,
      )

      if (error) {
        this.error(`${error.message}`)
      }

      amount = parsedAmount
    }

    if (amount === null || amount === undefined) {
      amount = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the amount',
        minimum: 1n,
        logger: this.logger,
        assetData,
        balance: {
          account: from,
        },
      })
    }
    return { targetToken, from, to, amount, asset, assetData, expiration }
  }

  private async constructBridgeTransaction(
    client: RpcClient,
    networkId: number,
    tokenWithNetwork: ChainportTokenWithNetwork,
    from: string,
    to: string,
    amount: bigint,
    asset: ChainportToken,
    assetData: RpcAsset,
    expiration: number | undefined,
  ) {
    const { flags } = await this.parse(BridgeCommand)

    ux.action.start('Fetching bridge transaction details')
    const txn = await fetchChainportBridgeTransaction(
      networkId,
      amount,
      asset.web3_address,
      tokenWithNetwork.network.chainport_network_id,
      to,
    )
    ux.action.stop()

    const params: CreateTransactionRequest = {
      account: from,
      outputs: [
        {
          publicAddress: txn.bridge_output.publicAddress,
          amount: txn.bridge_output.amount,
          memoHex: txn.bridge_output.memoHex,
          assetId: txn.bridge_output.assetId,
        },
        {
          publicAddress: txn.gas_fee_output.publicAddress,
          amount: txn.gas_fee_output.amount,
          memo: txn.gas_fee_output.memo,
        },
      ],
      fee: flags.fee ? CurrencyUtils.encode(flags.fee) : null,
      feeRate: flags.feeRate ? CurrencyUtils.encode(flags.feeRate) : null,
      expiration,
    }

    let rawTransaction: RawTransaction
    if (params.fee === null && params.feeRate === null) {
      rawTransaction = await selectFee({
        client,
        account: from,
        transaction: params,
        logger: this.logger,
      })
    } else {
      const response = await client.wallet.createTransaction(params)
      const bytes = Buffer.from(response.content.transaction, 'hex')
      rawTransaction = RawTransactionSerde.deserialize(bytes)
    }

    this.displayTransactionSummary(
      txn,
      rawTransaction,
      from,
      to,
      asset,
      assetData,
      tokenWithNetwork,
    )

    return rawTransaction
  }

  private displayTransactionSummary(
    txn: ChainportBridgeTransaction,
    raw: RawTransaction,
    from: string,
    to: string,
    sourceToken: ChainportToken,
    sourceAsset: RpcAsset,
    targetTokenWithNetwork: ChainportTokenWithNetwork,
  ) {
    const bridgeAmount = CurrencyUtils.render(
      BigInt(txn.bridge_output.amount) - BigInt(txn.bridge_fee.source_token_fee_amount ?? 0),
      true,
      'bridge amount id',
      {
        // Note we're using Chainport's token decimals here in case the verified asset decimals
        // don't match. We enforce through the API that the verified asset decimals are the same
        // as chainport's decimals, so it's unlikely this will happen.
        decimals: sourceToken.decimals,
        // The outputs are given in source tokens, so we use the source token's decimals, but display
        // using the target token's symbol. There could be rounding involved if the decimals don't match
        // on either end, hence why this is an estimate.
        symbol: targetTokenWithNetwork.token.symbol,
      },
    )
    const ironfishNetworkFee = CurrencyUtils.render(raw.fee, true)

    const targetNetworkFee = CurrencyUtils.render(BigInt(txn.gas_fee_output.amount), true)

    let chainportFee: string

    if (txn.bridge_fee.is_portx_fee_payment) {
      this.logger.log('\nStaked PortX detected')

      chainportFee = CurrencyUtils.render(
        BigInt(txn.bridge_fee.portx_fee_amount),
        true,
        'portx asset id',
        {
          decimals: 18,
          symbol: 'PORTX',
        },
      )
    } else {
      chainportFee = CurrencyUtils.render(
        BigInt(txn.bridge_fee.source_token_fee_amount ?? 0),
        true,
        'chainport fee id',
        {
          decimals: sourceToken.decimals,
          symbol: sourceAsset.verification.symbol,
        },
      )
    }

    const summary = `\
 \nBRIDGE TRANSACTION SUMMARY:

 From                           ${from}
 To                             ${to}
 Target Network                 ${targetTokenWithNetwork.network.label}
 Estimated Amount Received      ${bridgeAmount}

 Fees:
 Chainport Fee                  ${chainportFee}
 Target Network Fee             ${targetNetworkFee}
 Iron Fish Network Fee          ${ironfishNetworkFee}

 Outputs                        ${raw.outputs.length}
 Spends                         ${raw.spends.length}
 Expiration                     ${raw.expiration ? raw.expiration.toString() : ''}
 `
    this.logger.log(summary)
  }

  private async selectTokenWithNetwork(
    networkId: number,
    asset: ChainportToken,
  ): Promise<ChainportTokenWithNetwork> {
    ux.action.start('Fetching available networks')
    const networks = await fetchChainportTokenPaths(networkId, asset.id)
    ux.action.stop()

    if (networks.length === 0) {
      this.error(`No networks available for token ${asset.symbol} on Chainport`)
    }

    const result = await inquirer.prompt<{
      selection: ChainportTokenWithNetwork
    }>([
      {
        name: 'selection',
        message: `Select the network you would like to bridge ${asset.symbol} to`,
        type: 'list',
        choices: networks.map((network) => ({
          name: network.network.label,
          value: network,
        })),
      },
    ])

    return result.selection
  }
}
