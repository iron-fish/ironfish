/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import { UnsignedTransaction } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import * as ui from '../../../../ui'
import { MultisigTransactionJson } from '../../../../utils/multisig'
import { renderUnsignedTransactionDetails } from '../../../../utils/transaction'

export class CreateSignatureShareCommand extends IronfishCommand {
  static description = `Creates a signature share for a participant for a given transaction`

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account from which the signature share will be created',
    }),
    signingPackage: Flags.string({
      char: 's',
      description: 'The signing package for which the signature share will be created',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm creating signature share without confirming',
    }),
    path: Flags.string({
      description: 'Path to a JSON file containing multisig transaction data',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSignatureShareCommand)

    const loaded = await MultisigTransactionJson.load(this.sdk.fileSystem, flags.path)
    const options = MultisigTransactionJson.resolveFlags(flags, loaded)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let signingPackageString = options.signingPackage
    if (!signingPackageString) {
      signingPackageString = await ui.longPrompt('Enter the signing package')
    }

    const signingPackage = new multisig.SigningPackage(Buffer.from(signingPackageString, 'hex'))
    const unsignedTransaction = new UnsignedTransaction(
      signingPackage.unsignedTransaction().serialize(),
    )

    this.renderSigners(signingPackage.signers())

    await renderUnsignedTransactionDetails(
      client,
      unsignedTransaction,
      flags.account,
      this.logger,
    )

    if (!flags.confirm) {
      await ui.confirmOrQuit('Confirm new signature share creation')
    }

    const signatureShareResponse = await client.wallet.multisig.createSignatureShare({
      account: flags.account,
      signingPackage: signingPackageString,
    })

    this.log()
    this.log('Signature Share:')
    this.log(signatureShareResponse.content.signatureShare)

    this.log()
    this.log('Next step:')
    this.log(
      'Send the signature to the coordinator. They will aggregate the signatures from all participants and sign the transaction.',
    )
  }

  renderSigners(signers: Buffer[]): void {
    this.log('')
    this.log('==================')
    this.log('Signer Identities:')
    this.log('==================')

    for (const [i, signer] of signers.entries()) {
      if (i !== 0) {
        this.log('------------------')
      }
      this.log(signer.toString('hex'))
    }
  }
}
