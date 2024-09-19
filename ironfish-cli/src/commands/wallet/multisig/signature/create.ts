/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import { RpcClient, UnsignedTransaction } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import * as ui from '../../../../ui'
import { Ledger } from '../../../../utils/ledger'
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
    ledger: Flags.boolean({
      default: false,
      description: 'Create signature share using a Ledger device',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSignatureShareCommand)

    const loaded = await MultisigTransactionJson.load(this.sdk.fileSystem, flags.path)
    const options = MultisigTransactionJson.resolveFlags(flags, loaded)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let participantName = flags.account
    if (!participantName) {
      participantName = await ui.multisigSecretPrompt(client)
    }

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
      participantName,
      this.logger,
    )

    if (!flags.confirm) {
      await ui.confirmOrQuit('Confirm new signature share creation')
    }

    if (flags.ledger) {
      await this.createSignatureShareWithLedger(
        client,
        participantName,
        unsignedTransaction,
        signingPackage.frostSigningPackage().toString('hex'),
      )
      return
    }

    const signatureShareResponse = await client.wallet.multisig.createSignatureShare({
      account: participantName,
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

  async createSignatureShareWithLedger(
    client: RpcClient,
    participantName: string,
    unsignedTransaction: UnsignedTransaction,
    frostSigningPackage: string,
  ): Promise<void> {
    const ledger = new Ledger(this.logger)
    try {
      await ledger.connect(true)
    } catch (e) {
      if (e instanceof Error) {
        this.error(e.message)
      } else {
        throw e
      }
    }

    const identityResponse = await client.wallet.multisig.getIdentity({ name: participantName })
    const identity = identityResponse.content.identity

    const frostSignatureShare = await ledger.dkgSign(
      unsignedTransaction.publicKeyRandomness(),
      frostSigningPackage,
      unsignedTransaction.hash().toString('hex'),
    )

    const signatureShare = multisig.SignatureShare.fromFrost(
      frostSignatureShare,
      Buffer.from(identity, 'hex'),
    )

    this.log()
    this.log('Signature Share:')
    this.log(signatureShare.serialize().toString('hex'))

    this.log()
    this.log('Next step:')
    this.log(
      'Send the signature to the coordinator. They will aggregate the signatures from all participants and sign the transaction.',
    )
  }
}
