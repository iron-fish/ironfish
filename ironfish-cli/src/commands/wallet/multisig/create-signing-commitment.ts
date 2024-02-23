/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UnsignedTransaction } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { renderUnsignedTransactionDetails } from '../../../utils/transaction'

export class CreateSigningCommitmentCommand extends IronfishCommand {
  static description = 'Create a signing commitment from a participant for a given transaction'
  static hidden = true

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description:
        'The account to use for generating the commitment, must be a multisig participant account',
      required: false,
    }),
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'The unsigned transaction that needs to be signed',
      required: true,
    }),
    signerIdentity: Flags.string({
      char: 'i',
      description:
        'The identity of the participants that will sign the transaction (may be specified multiple times to add multiple signers)',
      required: true,
      multiple: true,
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm creating signature share without confirming',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSigningCommitmentCommand)

    const client = await this.sdk.connectRpc()

    const unsignedTransaction = new UnsignedTransaction(Buffer.from(flags.unsignedTransaction))

    await renderUnsignedTransactionDetails(client, unsignedTransaction, flags.account)

    const response = await client.wallet.multisig.createSigningCommitment({
      account: flags.account,
      unsignedTransaction: flags.unsignedTransaction,
      signers: flags.signerIdentity.map((identity) => ({ identity })),
    })

    this.log('Commitment:\n')
    this.log(response.content.commitment)
  }
}
