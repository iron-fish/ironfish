/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountImport } from '../../walletdb/accountValue'

export type AccountEncoder = {
  encode(value: AccountImport): string

  decode(value: string): AccountImport | null
}
