/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CurrencyUtils, RpcClient, UnsignedTransaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { longPrompt } from '../../../utils/longPrompt'

export class CreateSignatureShareCommand extends IronfishCommand {
  static description = `Creates a signature share for a participant for a given transaction`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account from which the signature share will be created',
      required: false,
    }),
    signingPackage: Flags.string({
      char: 's',
      description: 'The signing package for which the signature share will be created',
      required: false,
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm creating signature share without confirming',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSignatureShareCommand)
    let signingPackage = flags.signingPackage?.trim()

    if (!signingPackage) {
      signingPackage = await longPrompt('Enter the signing package: ')
    }

    const client = await this.sdk.connectRpc()
    const unsignedTransaction = UnsignedTransaction.fromSigningPackage(signingPackage)

    await this.renderUnsignedTransactionDetails(client, unsignedTransaction, flags.account)

    if (!flags.confirm) {
      const confirmed = await CliUx.ux.confirm('Confirm new signature share creation (Y/N)')
      if (!confirmed) {
        this.error('Creating signature share aborted')
      }
    }

    const signatureShareResponse = await client.wallet.multisig.createSignatureShare({
      account: flags.account,
      signingPackage,
    })

    this.log('Signature Share:\n')
    this.log(signatureShareResponse.content.signatureShare)
  }

  private async renderUnsignedTransactionDetails(
    client: RpcClient,
    unsignedTransaction: UnsignedTransaction,
    account?: string,
  ): Promise<void> {
    if (unsignedTransaction.mints.length > 0) {
      this.log()
      this.log('==================')
      this.log('Transaction Mints:')
      this.log('==================')

      for (const [i, mint] of unsignedTransaction.mints.entries()) {
        if (i !== 0) {
          this.log('------------------')
        }
        this.log()

        this.log(`Asset ID:      ${mint.asset.id().toString('hex')}`)
        this.log(`Name:          ${mint.asset.name().toString('utf8')}`)
        this.log(`Amount:        ${CurrencyUtils.renderIron(mint.value, false)}`)

        if (mint.transferOwnershipTo) {
          this.log(
            `Ownership of this asset will be transferred to ${mint.transferOwnershipTo.toString(
              'hex',
            )}. The current account will no longer have any permission to mint or modify this asset. This cannot be undone.`,
          )
        }
        this.log()
      }
    }

    if (unsignedTransaction.burns.length > 0) {
      this.log()
      this.log('==================')
      this.log('Transaction Burns:')
      this.log('==================')

      for (const [i, burn] of unsignedTransaction.burns.entries()) {
        if (i !== 0) {
          this.log('------------------')
        }
        this.log()

        this.log(`Asset ID:      ${burn.assetId.toString('hex')}`)
        this.log(`Amount:        ${CurrencyUtils.renderIron(burn.value, false)}`)
        this.log()
      }
    }

    if (unsignedTransaction.notes.length > 0) {
      const response = await client.wallet.getUnsignedTransactionNotes({
        account,
        unsignedTransaction: unsignedTransaction.serialize().toString('hex'),
      })

      if (response.content.sentNotes.length > 0) {
        this.log()
        this.log('==================')
        this.log('Notes sent:')
        this.log('==================')

        let logged = false
        for (const note of response.content.sentNotes) {
          // Skip this since we'll re-render for received notes
          if (note.owner === note.sender) {
            continue
          }

          if (logged) {
            this.log('------------------')
          }
          logged = true
          this.log()

          this.log(`Amount:        ${CurrencyUtils.renderIron(note.value, true, note.assetId)}`)
          this.log(`Memo:          ${note.memo}`)
          this.log(`Recipient:     ${note.owner}`)
          this.log(`Sender:        ${note.sender}`)
          this.log()
        }
      }

      if (response.content.sentNotes.length > 0) {
        this.log()
        this.log('==================')
        this.log('Notes received:')
        this.log('==================')

        for (const [i, note] of response.content.receivedNotes.entries()) {
          if (i !== 0) {
            this.log('------------------')
          }
          this.log()

          this.log(`Amount:        ${CurrencyUtils.renderIron(note.value, true, note.assetId)}`)
          this.log(`Memo:          ${note.memo}`)
          this.log(`Recipient:     ${note.owner}`)
          this.log(`Sender:        ${note.sender}`)
          this.log()
        }
      }
    }

    this.log()
  }
}
