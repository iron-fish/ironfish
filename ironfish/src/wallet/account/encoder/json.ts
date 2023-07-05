/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { validateAccount } from '../../validator'
import { AccountImport, AccountValue } from '../../walletdb/accountValue'
import { AccountEncoder } from './encoder'

export class JsonEncoder implements AccountEncoder {
  encode(value: AccountImport): string {
    return JSON.stringify(value)
  }

  decode(value: string): AccountImport {
    const account = JSON.parse(value) as AccountImport
    // TODO: consolidate AccountImport and AccountValue createdAt types
    validateAccount(account as AccountValue)
    return account
  }
}
