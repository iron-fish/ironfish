/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import {
  CreateTransactionRequest,
  CurrencyUtils,
  RawTransaction,
  RawTransactionSerde,
  RpcAsset,
  RpcClient,
  TESTNET,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import inquirer from 'inquirer'
import * as validator from 'web3-validator'
import { IronfishCommand } from '../../../command'
import { HexFlag, IronFlag, RemoteFlags, ValueFlag } from '../../../flags'
import { confirmOperation, selectAsset } from '../../../utils'
import {
  ChainportBridgeTransaction,
  ChainportNetwork,
  ChainportVerifiedToken,
  fetchChainportBridgeTransaction,
  fetchChainportNetworkMap,
  fetchChainportVerifiedTokens,
} from '../../../utils/chainport'
import { promptCurrency } from '../../../utils/currency'
import { getExplorer } from '../../../utils/explorer'
import { selectFee } from '../../../utils/fees'
import { watchTransaction } from '../../../utils/transaction'

export class BridgeCommand extends IronfishCommand {
  static description = `Use the Chainport bridge to bridge assets to EVM networks.`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed on Ironfish',
    }),
    account: Flags.string({
      char: 'f',
      description: 'The account to send the asset from',
    }),
    to: Flags.string({
      char: 't',
      description: 'The Ethereum public address of the recipient',
    }),
    amount: ValueFlag({
      char: 'a',
      description: 'The amount of the asset in the major denomination',
      flagName: 'amount',
    }),
    assetId: HexFlag({
      char: 'i',
      description: 'The identifier for the asset to use when bridging',
    }),
    fee: IronFlag({
      char: 'o',
      description: 'The fee amount in IRON',
      minimum: 1n,
      flagName: 'fee',
    }),
    expiration: Flags.integer({
      char: 'e',
      description:
        'The block sequence after which the transaction will be removed from the mempool. Set to 0 for no expiration.',
    }),
  }

  async start(): Promise<void> {
    const client = await this.sdk.connectRpc()
    const { flags } = await this.parse(BridgeCommand)

    if (!flags.offline) {
      const status = await client.wallet.getNodeStatus()

      if (!status.content.blockchain.synced) {
        this.error(
          `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
        )
      }
    }

    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    if (networkId !== TESTNET.id) {
      this.error(`Chainport transactions are only available on testnet.`)
    }

    const { targetNetwork, from, to, amount, asset, assetData } =
      await this.getAndValidateInputs(client, networkId)

    const rawTransaction = await this.constructBridgeTransaction(
      client,
      networkId,
      targetNetwork,
      from,
      to,
      amount,
      asset,
      assetData,
    )

    await confirmOperation({})

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

    let from = flags.account?.trim()
    let to = flags.to?.trim()
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
      to = await CliUx.ux.prompt('Enter the public address of the recipient', {
        required: true,
      })
    }

    if (!validator.isAddress(to)) {
      this.error('Invalid to ethereum address')
    }

    if (flags.expiration !== undefined && flags.expiration < 0) {
      this.error('Expiration sequence must be non-negative')
    }

    const tokens = await fetchChainportVerifiedTokens(networkId)

    if (assetId == null) {
      const asset = await selectAsset(client, from, {
        action: 'send',
        showNativeAsset: true,
        showNonCreatorAsset: true,
        showSingleAssetChoice: false,
        filter: (asset) => {
          return tokens.some((t) => t.web3_address === asset.id)
        },
      })

      assetId = asset?.id

      if (!assetId) {
        assetId = Asset.nativeId().toString('hex')
      }
    }

    const asset: ChainportVerifiedToken | undefined = tokens.find(
      (t) => t.web3_address === assetId,
    )

    if (!asset) {
      const names = tokens.map(
        (t, index) => `${index + 1}. ${t.name} (${t.symbol}) - ${t.web3_address}`,
      )

      this.error(
        `Asset ${assetId} not supported by Chainport. Here are the supported tokens: \n\n${names.join(
          '\n',
        )}\n`,
      )
    }

    const targetNetworks = asset.target_networks

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

    const targetNetwork = await this.selectNetwork(networkId, targetNetworks, asset)

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
        text: 'Enter the amount in the major denomination',
        minimum: 1n,
        logger: this.logger,
        assetId: assetId,
        assetVerification: assetData.verification,
        balance: {
          account: from,
        },
      })
    }
    return { targetNetwork, from, to, amount, asset, assetData }
  }

  private async constructBridgeTransaction(
    client: RpcClient,
    networkId: number,
    network: ChainportNetwork,
    from: string,
    to: string,
    amount: bigint,
    asset: ChainportVerifiedToken,
    assetData: RpcAsset,
  ) {
    const { flags } = await this.parse(BridgeCommand)

    const txn = await fetchChainportBridgeTransaction(networkId, amount, to, network, asset)

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
      expiration: flags.expiration,
    }

    let rawTransaction: RawTransaction
    if (params.fee === null && params.feeRate === null) {
      rawTransaction = await selectFee({
        client,
        transaction: params,
        logger: this.logger,
      })
    } else {
      const response = await client.wallet.createTransaction(params)
      const bytes = Buffer.from(response.content.transaction, 'hex')
      rawTransaction = RawTransactionSerde.deserialize(bytes)
    }

    this.displayTransactionSummary(txn, rawTransaction, from, to, asset, assetData, network)

    return rawTransaction
  }

  private displayTransactionSummary(
    txn: ChainportBridgeTransaction,
    raw: RawTransaction,
    from: string,
    to: string,
    asset: ChainportVerifiedToken,
    assetData: RpcAsset,
    network: ChainportNetwork,
  ) {
    const bridgeAmount = CurrencyUtils.render(
      BigInt(txn.bridge_output.amount) - BigInt(txn.bridge_fee.source_token_fee_amount ?? 0),
      true,
      asset.web3_address,
      assetData.verification,
    )
    const ironfishNetworkFee = CurrencyUtils.render(raw.fee, true)

    const targetNetworkFee = CurrencyUtils.render(
      BigInt(txn.gas_fee_output.amount),
      true,
      asset.web3_address,
      assetData.verification,
    )

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
        asset.web3_address,
        assetData.verification,
      )
    }

    const summary = `\
 \nBRIDGE TRANSACTION SUMMARY:
 
 From                           ${from}
 To                             ${to}
 Target Network                 ${network.name}
 Estimated Amount Received      ${bridgeAmount}
 
 Fees:
 Chainport Fee                  ${chainportFee}
 Target Network Fee             ${targetNetworkFee}
 Ironfish Network Fee           ${ironfishNetworkFee}
 
 Outputs                        ${raw.outputs.length}
 Spends                         ${raw.spends.length}
 Expiration                     ${raw.expiration ? raw.expiration.toString() : ''}
 `
    this.logger.log(summary)
  }

  private async selectNetwork(
    networkId: number,
    targetNetworks: number[],
    asset: ChainportVerifiedToken,
  ): Promise<ChainportNetwork> {
    CliUx.ux.action.start('Fetching available networks')
    const networks = await fetchChainportNetworkMap(networkId)
    CliUx.ux.action.stop()

    const choices = Object.keys(networks).map((key) => {
      return {
        name: networks[key].label,
        value: networks[key],
      }
    })

    const filteredChoices = choices.filter((choice) =>
      targetNetworks.includes(choice.value.chainport_network_id),
    )

    if (filteredChoices.length === 0) {
      this.error(`No networks available for token ${asset.symbol} on Chainport`)
    }

    const result = await inquirer.prompt<{
      selection: ChainportNetwork
    }>([
      {
        name: 'selection',
        message: `Select the network you would like to bridge ${asset.symbol} to`,
        type: 'list',
        choices: filteredChoices,
      },
    ])

    return result.selection
  }
}
