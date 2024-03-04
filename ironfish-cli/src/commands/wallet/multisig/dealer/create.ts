/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ACCOUNT_SCHEMA_VERSION } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'

export class MultisigCreateDealer extends IronfishCommand {
  static description = `Create a set of multisig accounts from identities`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    name: Flags.string({
      char: 'n',
      description: 'Name to use for the coordinator',
    }),
    identity: Flags.string({
      char: 'i',
      description: 'Identity of a participant',
      multiple: true,
    }),
    minSigners: Flags.integer({
      char: 'm',
      description: 'Minimum number of signers to meet signing threshold',
    }),
    importCoordinator: Flags.boolean({
      char: 'c',
      default: true,
      description: 'Import the coordinator as a view-only account after creating key packages',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigCreateDealer)

    let identities = flags.identity
    if (!identities || identities.length < 2) {
      const input = await CliUx.ux.prompt('Enter the identities separated by commas', {
        required: true,
      })
      identities = input.split(',')

      if (identities.length < 2) {
        this.error('Minimum number of identities must be at least 2')
      }
    }
    identities = identities.map((i) => i.trim())

    let minSigners = flags.minSigners
    if (!minSigners) {
      const input = await CliUx.ux.prompt('Enter the number of minimum signers', {
        required: true,
      })
      minSigners = parseInt(input)
      if (isNaN(minSigners) || minSigners < 2) {
        this.error('Minimum number of signers must be at least 2')
      }
    }

    const name =
      flags.name?.trim() ??
      (await CliUx.ux.prompt('Enter the name for the coordinator', { required: true }))

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.multisig.createTrustedDealerKeyPackage({
      minSigners,
      participants: identities.map((identity) => ({ identity })),
    })

    const chainResponse = await client.chain.getChainInfo()
    const hash = Buffer.from(chainResponse.content.currentBlockIdentifier.hash, 'hex')
    const sequence = Number(chainResponse.content.currentBlockIdentifier.index)
    const createdAt = {
      hash,
      sequence,
    }

    if (flags.importCoordinator) {
      this.log()
      CliUx.ux.action.start('Importing the coordinator as a view-only account')

      await client.wallet.importAccount({
        account: {
          name,
          version: ACCOUNT_SCHEMA_VERSION,
          createdAt: {
            hash: createdAt.hash.toString('hex'),
            sequence: createdAt.sequence,
          },
          spendingKey: null,
          viewKey: response.content.viewKey,
          incomingViewKey: response.content.incomingViewKey,
          outgoingViewKey: response.content.outgoingViewKey,
          publicAddress: response.content.publicAddress,
          proofAuthorizingKey: response.content.proofAuthorizingKey,
          multisigKeys: {
            publicKeyPackage: response.content.publicKeyPackage,
          },
        },
      })

      CliUx.ux.action.stop()
    }

    for (const [i, { identity, account }] of response.content.participantAccounts.entries()) {
      this.log('\n')
      this.log(`Account ${i + 1}`)
      this.log(`Identity ${identity}`)
      this.log('----------------')
      this.log(account)
    }

    this.log()
  }
}
