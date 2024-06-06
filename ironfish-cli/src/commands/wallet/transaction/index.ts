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
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import {
  displayChainportTransactionSummary,
  extractChainportDataFromTransaction,
  fetchChainportNetworkMap,
  getAssetsByIDs,
} from '../../../utils'
import { getExplorer } from '../../../utils/explorer'

export class TransactionCommand extends IronfishCommand {
  static description = `Display an account transaction`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'hash',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'Hash of the transaction',
    },
    {
      name: 'account',
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(TransactionCommand)
    const hash = args.hash as string
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()
    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    const response = await client.wallet.getAccountTransaction({
      account,
      hash,
    })

    if (!response.content.transaction) {
      this.log(`No transaction found by hash ${hash}`)
      return
    }

    // by default the notes and spends should be returned
    Assert.isNotUndefined(response.content.transaction.notes)
    Assert.isNotUndefined(response.content.transaction.spends)

    const renderedFee = CurrencyUtils.render(response.content.transaction.fee, true)
    const explorerUrl = getExplorer(networkId)?.getTransactionUrl(hash)

    this.log(`Transaction: ${hash}`)
    if (explorerUrl) {
      this.log(`Explorer: ${explorerUrl}`)
    }
    this.log(`Account: ${response.content.account}`)
    this.log(`Status: ${response.content.transaction.status}`)
    this.log(`Type: ${response.content.transaction.type}`)
    this.log(`Timestamp: ${TimeUtils.renderString(response.content.transaction.timestamp)}`)
    this.log(`Fee: ${renderedFee}`)
    if (response.content.transaction.blockHash && response.content.transaction.blockSequence) {
      this.log(`Block Hash: ${response.content.transaction.blockHash}`)
      this.log(`Block Sequence: ${response.content.transaction.blockSequence}`)
    }
    this.log(`Notes Count: ${response.content.transaction.notes.length}`)
    this.log(`Spends Count: ${response.content.transaction.spends.length}`)
    this.log(`Mints Count: ${response.content.transaction.mints.length}`)
    this.log(`Burns Count: ${response.content.transaction.burns.length}`)
    this.log(`Sender: ${response.content.transaction.notes[0].sender}`)

    const chainportTxnDetails = extractChainportDataFromTransaction(
      networkId,
      response.content.transaction,
    )

    if (chainportTxnDetails) {
      this.log(`\n---Chainport Bridge Transaction Summary---\n`)

      CliUx.ux.action.start('Fetching network details')
      const chainportNetworks = await fetchChainportNetworkMap(networkId)
      CliUx.ux.action.stop()

      await displayChainportTransactionSummary(
        networkId,
        hash,
        chainportTxnDetails,
        chainportNetworks[chainportTxnDetails.chainportNetworkId],
        this.logger,
      )
    }

    if (response.content.transaction.notes.length > 0) {
      this.log(`\n---Notes---\n`)

      const noteAssetPairs: {
        note: RpcWalletNote
        asset: RpcAsset
      }[] = []

      for (const note of response.content.transaction.notes) {
        const asset = await client.wallet.getAsset({
          id: note.assetId,
        })

        noteAssetPairs.push({
          note,
          asset: asset.content,
        })
      }

      CliUx.ux.table(noteAssetPairs, {
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

    if (response.content.transaction.spends.length > 0) {
      this.log(`\n---Spends---\n`)
      CliUx.ux.table(response.content.transaction.spends, {
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

    const assetBalanceDeltas = response.content.transaction.assetBalanceDeltas
    if (assetBalanceDeltas) {
      const assetLookup = await getAssetsByIDs(
        client,
        assetBalanceDeltas.map((b) => b.assetId),
        account,
        undefined,
      )

      this.log(`\n---Asset Balance Deltas---\n`)
      CliUx.ux.table(assetBalanceDeltas, {
        assetId: {
          header: 'Asset ID',
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
