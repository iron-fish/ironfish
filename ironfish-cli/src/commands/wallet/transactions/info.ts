/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Assert,
  BufferUtils,
  CurrencyUtils,
  RpcAsset,
  RpcWalletNote,
  TimeUtils,
} from '@ironfish/sdk'
import { Args, Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import {
  ChainportNetwork,
  displayChainportTransactionSummary,
  extractChainportDataFromTransaction,
  fetchChainportNetworks,
  getAssetsByIDs,
  useAccount,
} from '../../../utils'
import { getExplorer } from '../../../utils/explorer'

export class TransactionInfoCommand extends IronfishCommand {
  static description = `show an account transaction's info`

  static hiddenAliases = ['wallet:transaction']

  static args = {
    transaction: Args.string({
      required: true,
      description: 'Hash of the transaction',
    }),
  }

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to get transaction details for',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(TransactionInfoCommand)
    const { transaction: hash } = args

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const account = await useAccount(client, flags.account)

    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    const response = await client.wallet.getAccountTransaction({
      account,
      hash,
    })

    const transaction = response.content.transaction

    if (!transaction) {
      this.log(`No transaction found by hash ${hash}`)
      return
    }

    // by default the notes and spends should be returned
    Assert.isNotUndefined(transaction.notes)
    Assert.isNotUndefined(transaction.spends)

    const renderedFee = CurrencyUtils.render(transaction.fee, true)
    const explorerUrl = getExplorer(networkId)?.getTransactionUrl(hash)

    const data: Record<string, unknown> = {
      Transaction: hash,
    }
    if (explorerUrl) {
      data['Explorer'] = explorerUrl
    }
    data['Account'] = response.content.account
    data['Status'] = transaction.status
    data['Type'] = transaction.type
    data['Timestamp'] = TimeUtils.renderString(transaction.timestamp)
    data['Fee'] = renderedFee
    if (transaction.blockHash && transaction.blockSequence) {
      data['Block Hash'] = transaction.blockHash
      data['Block Sequence'] = transaction.blockSequence
    }
    data['Notes Count'] = transaction.notes.length
    data['Spends Count'] = transaction.spends.length
    data['Mints Count'] = transaction.mints.length
    data['Burns Count'] = transaction.burns.length
    data['Sender'] = transaction.notes[0].sender
    this.log(ui.card(data))

    const chainportTxnDetails = extractChainportDataFromTransaction(networkId, transaction)

    if (chainportTxnDetails) {
      this.log(`\n---Chainport Bridge Transaction Summary---\n`)

      let network: ChainportNetwork | undefined
      try {
        ux.action.start('Fetching network details')
        const chainportNetworks = await fetchChainportNetworks(networkId)
        network = chainportNetworks.find(
          (n) => n.chainport_network_id === chainportTxnDetails.chainportNetworkId,
        )
        ux.action.stop()
      } catch (e: unknown) {
        ux.action.stop('error')

        if (e instanceof Error) {
          this.logger.debug(e.message)
        }
      }

      await displayChainportTransactionSummary(
        networkId,
        transaction,
        chainportTxnDetails,
        network,
        this.logger,
      )
    }

    if (transaction.notes.length > 0) {
      this.log(`\n---Notes---\n`)

      const noteAssetPairs: {
        note: RpcWalletNote
        asset: RpcAsset
      }[] = []

      for (const note of transaction.notes) {
        const asset = await client.wallet.getAsset({
          account: account,
          id: note.assetId,
        })

        noteAssetPairs.push({
          note,
          asset: asset.content,
        })
      }

      ui.table(noteAssetPairs, {
        amount: {
          header: 'Amount',
          get: ({ asset, note }) =>
            CurrencyUtils.render(note.value, false, asset.id, asset.verification),
        },
        assetName: {
          header: 'Asset Name',
          get: ({ asset }) => BufferUtils.toHuman(Buffer.from(asset.name, 'hex')),
        },
        assetId: {
          header: 'Asset Id',
          get: ({ note }) => note.assetId,
        },
        isSpent: {
          header: 'Spent',
          get: ({ note }) => (!note.owner ? '?' : note.spent ? `✔` : `x`),
        },
        memo: {
          header: 'Memo',
          get: ({ note }) => note.memo,
        },
        owner: {
          header: 'Owner Address',
          get: ({ note }) => note.owner,
        },
      })
    }

    if (transaction.spends.length > 0) {
      this.log(`\n---Spends---\n`)
      ui.table(transaction.spends, {
        size: {
          header: 'Size',
          get: (spend) => spend.size,
        },
        nullifier: {
          header: 'Nullifier',
          get: (spend) => spend.nullifier,
        },
        commitmment: {
          header: 'Commitment',
          get: (spend) => spend.commitment,
        },
      })
    }

    const assetBalanceDeltas = transaction.assetBalanceDeltas
    if (assetBalanceDeltas) {
      const assetLookup = await getAssetsByIDs(
        client,
        assetBalanceDeltas.map((b) => b.assetId),
        account,
        undefined,
      )

      this.log(`\n---Asset Balance Deltas---\n`)
      ui.table(assetBalanceDeltas, {
        assetId: {
          header: 'Asset ID',
          get: (assetBalanceDelta) => assetBalanceDelta.assetId,
        },
        delta: {
          header: 'Balance Change',
          get: (assetBalanceDelta) =>
            CurrencyUtils.render(
              assetBalanceDelta.delta,
              false,
              assetBalanceDelta.assetId,
              assetLookup[assetBalanceDelta.assetId].verification,
            ),
        },
      })
    }
  }
}
