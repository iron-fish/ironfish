/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RPC_ERROR_CODES, RpcRequestError } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { LedgerMultiSigner } from '../../../../ledger'
import * as ui from '../../../../ui'

export class MultisigIdentityCreate extends IronfishCommand {
  static description = `Create a multisig participant identity`

  static flags = {
    ...RemoteFlags,
    name: Flags.string({
      char: 'n',
      description: 'Name to associate with the identity',
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Perform operation with a ledger device',
      hidden: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigIdentityCreate)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let name = flags.name
    if (!name) {
      name = await ui.inputPrompt('Enter a name for the identity', true)
    }

    let identity
    if (flags.ledger) {
      identity = await this.getIdentityFromLedger()
    }

    let response
    while (!response) {
      try {
        if (identity) {
          response = await client.wallet.multisig.importParticipant({
            name,
            identity: identity.toString('hex'),
          })
        } else {
          response = await client.wallet.multisig.createParticipant({ name })
        }
      } catch (e) {
        if (
          e instanceof RpcRequestError &&
          (e.code === RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME.toString() ||
            e.code === RPC_ERROR_CODES.DUPLICATE_IDENTITY_NAME.toString())
        ) {
          this.log()
          this.log(e.codeMessage)
          name = await ui.inputPrompt('Enter a new name for the identity', true)
        } else {
          throw e
        }
      }
    }

    this.log('Identity:')
    this.log(response.content.identity)
  }

  async getIdentityFromLedger(): Promise<Buffer> {
    const ledger = new LedgerMultiSigner()
    try {
      await ledger.connect()
    } catch (e) {
      if (e instanceof Error) {
        this.error(e.message)
      } else {
        throw e
      }
    }

    // TODO(hughy): support multiple identities using index
    return ledger.dkgGetIdentity(0)
  }
}
