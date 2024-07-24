/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UnsignedTransaction } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { confirmOrQuit } from '../../../../ui'
import { longPrompt } from '../../../../utils/input'
import { MultisigTransactionJson } from '../../../../utils/multisig'
import { renderUnsignedTransactionDetails } from '../../../../utils/transaction'

export class CreateSigningCommitmentCommand extends IronfishCommand {
  static description = 'Create a signing commitment from a participant for a given transaction'

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
    }),
    identity: Flags.string({
      char: 'i',
      description:
        'The identity of the participants that will sign the transaction (may be specified multiple times to add multiple signers)',
      multiple: true,
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm creating signing commitment without confirming',
    }),
    path: Flags.string({
      description: 'Path to a JSON file containing multisig transaction data',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSigningCommitmentCommand)

    const loaded = await MultisigTransactionJson.load(this.sdk.fileSystem, flags.path)
    const options = MultisigTransactionJson.resolveFlags(flags, loaded)

    let identities = options.identity
    if (!identities || identities.length < 2) {
      const input = await longPrompt(
        'Enter the identities of all participants who will sign the transaction, separated by commas',
        {
          required: true,
        },
      )
      identities = input.split(',')

      if (identities.length < 2) {
        this.error('Minimum number of identities must be at least 2')
      }
    }
    identities = identities.map((i) => i.trim())

    let unsignedTransactionInput = options.unsignedTransaction
    if (!unsignedTransactionInput) {
      unsignedTransactionInput = await longPrompt('Enter the unsigned transaction', {
        required: true,
      })
    }

    const client = await this.connectRpc()
    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(unsignedTransactionInput, 'hex'),
    )

    await renderUnsignedTransactionDetails(
      client,
      unsignedTransaction,
      flags.account,
      this.logger,
    )

    await confirmOrQuit('Confirm signing commitment creation', flags.confirm)

    const response = await client.wallet.multisig.createSigningCommitment({
      account: flags.account,
      unsignedTransaction: unsignedTransactionInput,
      signers: identities.map((identity) => ({ identity })),
    })

    this.log('\nCommitment:\n')
    this.log(response.content.commitment)

    this.log()
    this.log('Next step:')
    this.log('Send the commitment to the multisig account coordinator.')
  }
}
