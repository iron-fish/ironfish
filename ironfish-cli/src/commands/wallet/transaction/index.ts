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
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(TransactionCommand)
    const hash = args.hash as string
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

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

    this.log(`Transaction: ${hash}`)
    this.log(`Account: ${response.content.account}`)
    this.log(`Status: ${response.content.transaction.status}`)
    this.log(`Type: ${response.content.transaction.type}`)
    this.log(`Timestamp: ${TimeUtils.renderString(response.content.transaction.timestamp)}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(response.content.transaction.fee, true)}`)
    if (response.content.transaction.blockHash && response.content.transaction.blockSequence) {
      this.log(`Block Hash: ${response.content.transaction.blockHash}`)
      this.log(`Block Sequence: ${response.content.transaction.blockSequence}`)
    }
    this.log(`Notes Count: ${response.content.transaction.notes.length}`)
    this.log(`Spends Count: ${response.content.transaction.spends.length}`)
    this.log(`Mints Count: ${response.content.transaction.mints.length}`)
    this.log(`Burns Count: ${response.content.transaction.burns.length}`)
    this.log(`Sender: ${response.content.transaction.notes[0].sender}`)

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
          get: ({ note }) => CurrencyUtils.renderIron(note.value),
        },
        assetName: {
          header: 'Asset Name',
          get: ({ asset }) => BufferUtils.toHuman(Buffer.from(asset.name, 'hex')),
        },
        assetId: {
          header: 'Asset Id',
        },
        isSpent: {
          header: 'Spent',
          get: ({ note }) => (!note.owner ? '?' : note.spent ? `✔` : `x`),
        },
        memo: {
          header: 'Memo',
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

    if (response.content.transaction.assetBalanceDeltas) {
      this.log(`\n---Asset Balance Deltas---\n`)
      CliUx.ux.table(response.content.transaction.assetBalanceDeltas, {
        assetId: {
          header: 'Asset ID',
        },
        delta: {
          header: 'Balance Change',
        },
      })
    }
  }
}
