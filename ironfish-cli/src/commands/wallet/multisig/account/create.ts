/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ACCOUNT_SCHEMA_VERSION, Base64JsonEncoder } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'

export class MultisigCreate extends IronfishCommand {
  static description = `Create a set of multisig accounts from identifiers`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    name: Flags.string({
      char: 'n',
      description: 'Name of the multisig account (must be unique for all participants!',
    }),
    identifier: Flags.string({
      char: 'i',
      description: 'Identifier of a participant',
      multiple: true,
    }),
    minSigners: Flags.integer({
      char: 'm',
      description: 'Minimum number of signers to meet signing threshold',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigCreate)

    const identifiers = flags.identifier as string[]

    if (!identifiers || identifiers.length < 2) {
      this.error('At least two identifiers are required')
    }
    const minSigners = flags.minSigners as number
    if (!minSigners || minSigners < 2) {
      this.error('Minimum number of signers must be at least 2')
    }
    const name = flags.name as string
    if (!name) {
      this.error('Name is required')
    }

    const client = await this.sdk.connectRpc()

    const response = await client.multisig.createTrustedDealerKeyPackage({
      minSigners,
      participants: identifiers.map((identifier) => ({ identifier })),
    })

    const chainResponse = await client.chain.getChainInfo()
    const hash = Buffer.from(chainResponse.content.currentBlockIdentifier.hash, 'hex')
    const sequence = Number(chainResponse.content.currentBlockIdentifier.index)
    const createdAt = {
      hash,
      sequence,
    }

    const encoder = new Base64JsonEncoder()
    this.log('\n')

    response.content.keyPackages.map((keyPackage) => {
      this.log('Account for identifier: ' + keyPackage.identifier)
      const accountStr = encoder.encode({
        name,
        version: ACCOUNT_SCHEMA_VERSION,
        createdAt,
        spendingKey: null,
        viewKey: response.content.viewKey,
        incomingViewKey: response.content.incomingViewKey,
        outgoingViewKey: response.content.outgoingViewKey,
        publicAddress: response.content.publicAddress,
        proofAuthorizingKey: response.content.proofAuthorizingKey,
        multiSigKeys: {
          identifier: keyPackage.identifier,
          keyPackage: keyPackage.keyPackage,
          publicKeyPackage: response.content.publicKeyPackage,
        },
      })
      this.log(accountStr)
      this.log('\n')
    })
  }
}
