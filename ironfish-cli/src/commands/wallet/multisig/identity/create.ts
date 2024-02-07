/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { IronfishCommand } from '../../../../command'

export class MultisigIdentityCreate extends IronfishCommand {
  static description = `Create a multisig identity`
  static hidden = true

  start(): void {
    // TODO: generate secret over RPC, persist in walletDb
    const secret = ParticipantSecret.random()

    const identity = secret.toIdentity()
    this.log('Identity:')
    this.log(identity.serialize().toString('hex'))

    this.log()

    // TODO: remove when other multisig CLI commands use identity as inputs
    const identifier = identity.toFrostIdentifier()
    this.log('Identifier:')
    this.log(identifier)
  }
}
