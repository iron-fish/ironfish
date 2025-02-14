/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ACCOUNT_SCHEMA_VERSION, AccountImport } from '@ironfish/sdk'
import { IronfishKeys, KeyResponse, ResponseSign } from '@zondax/ledger-ironfish'
import { isResponseAddress, isResponseProofGenKey, isResponseViewKey, Ledger } from './ledger'

export class LedgerSingleSigner extends Ledger {
  constructor() {
    super(false)
  }

  getPublicAddress = async (showInDevice: boolean = false) => {
    const response: KeyResponse = await this.tryInstruction((app) =>
      app.retrieveKeys(this.PATH, IronfishKeys.PublicAddress, showInDevice),
    )

    if (!isResponseAddress(response)) {
      throw new Error(`No public address returned.`)
    }

    return response.publicAddress.toString('hex')
  }

  importAccount = async (): Promise<AccountImport> => {
    const publicAddress = await this.getPublicAddress()

    const responseViewKey: KeyResponse = await this.tryInstruction((app) =>
      app.retrieveKeys(this.PATH, IronfishKeys.ViewKey, true),
    )

    if (!isResponseViewKey(responseViewKey)) {
      throw new Error(`No view key returned.`)
    }

    const responsePGK: KeyResponse = await this.tryInstruction((app) =>
      app.retrieveKeys(this.PATH, IronfishKeys.ProofGenerationKey, false),
    )

    if (!isResponseProofGenKey(responsePGK)) {
      throw new Error(`No proof authorizing key returned.`)
    }

    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'ledger',
      publicAddress,
      viewKey: responseViewKey.viewKey.toString('hex'),
      incomingViewKey: responseViewKey.ivk.toString('hex'),
      outgoingViewKey: responseViewKey.ovk.toString('hex'),
      proofAuthorizingKey: responsePGK.nsk.toString('hex'),
      spendingKey: null,
      createdAt: null,
      ledger: true,
    }

    return accountImport
  }

  sign = async (message: string): Promise<Buffer> => {
    const buffer = Buffer.from(message, 'hex')

    // max size of a transaction is 16kb
    if (buffer.length > 16 * 1024) {
      throw new Error('Transaction size is too large, must be less than 16kb.')
    }

    const response: ResponseSign = await this.tryInstruction((app) =>
      app.sign(this.PATH, buffer),
    )

    return response.signature
  }
}
