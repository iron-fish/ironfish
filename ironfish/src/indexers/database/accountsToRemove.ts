/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export interface AccountsToRemoveValue {
  accounts: string[]
}

export class AccountsToRemoveValueEncoding implements IDatabaseEncoding<AccountsToRemoveValue> {
  serialize(value: AccountsToRemoveValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    for (const account of value.accounts) {
      bw.writeVarString(account, 'utf8')
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): AccountsToRemoveValue {
    const reader = bufio.read(buffer, true)

    const accounts = []

    while (reader.left()) {
      accounts.push(reader.readVarString('utf8'))
    }

    return { accounts }
  }

  getSize(value: AccountsToRemoveValue): number {
    let size = 0

    for (const account of value.accounts) {
      size += bufio.sizeVarString(account, 'utf8')
    }

    return size
  }
}
