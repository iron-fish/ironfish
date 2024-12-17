/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ACCOUNT_SCHEMA_VERSION, AccountImport, JsonEncoder, RpcClient } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import * as ui from '../../../../ui'

export class MultisigCreateDealer extends IronfishCommand {
  static description = `Create a set of multisig accounts from participant identities`

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

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let identities = flags.identity
    if (!identities || identities.length < 2) {
      const input = await ui.longPrompt(
        'Enter the identities of all participants, separated by commas',
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

    let minSigners = flags.minSigners
    if (!minSigners) {
      const input = await ui.inputPrompt('Enter the number of minimum signers', true)
      minSigners = parseInt(input)
      if (isNaN(minSigners) || minSigners < 2) {
        this.error('Minimum number of signers must be at least 2')
      }
    }

    const name = await this.getCoordinatorName(client, flags.name?.trim())

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
      ux.action.start('Importing the coordinator as a view-only account')

      const account: AccountImport = {
        name,
        version: ACCOUNT_SCHEMA_VERSION,
        createdAt: {
          hash: createdAt.hash,
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
        ledger: false,
      }

      await client.wallet.importAccount({
        account: new JsonEncoder().encode(account),
      })

      ux.action.stop()
    }

    for (const [i, { identity, account }] of response.content.participantAccounts.entries()) {
      this.log('\n')
      this.log(`Account ${i + 1}`)
      this.log(`Identity ${identity}`)
      this.log('----------------')
      this.log(account)
    }

    this.log()
    this.log('Next step:')
    this.log('Send the account imports to the participant with the corresponding identity.')
  }

  async getCoordinatorName(client: RpcClient, inputName?: string): Promise<string> {
    const accountsResponse = await client.wallet.getAccounts()
    const accountNames = new Set(accountsResponse.content.accounts)

    const identitiesResponse = await client.wallet.multisig.getIdentities()
    const secretNames = new Set(identitiesResponse.content.identities.map((i) => i.name))

    let name = inputName
    do {
      name = name ?? (await ui.inputPrompt('Enter a name for the coordinator', true))

      if (accountNames.has(name)) {
        this.log(`Account with name ${name} already exists`)
        this.log('')
        name = undefined
      } else if (secretNames.has(name)) {
        this.log(`Multisig identity with name ${name} already exists`)
        this.log('')
        name = undefined
      }
    } while (name === undefined)

    return name
  }
}
