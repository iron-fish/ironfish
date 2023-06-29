/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { EncodingError } from 'bufio'
import { Bech32m } from '../../../utils'
import { AccountImport } from '../../walletdb/accountValue'
import { AccountEncoder } from './encoder'
export class Bech32JsonEncoder implements AccountEncoder {
  /**
   * @deprecated Bech32 JSON encoding is deprecated. Use the newest version of the Bech32JSONEncoder.
   */
  encode(value: AccountImport): string {
    return Bech32m.encode(JSON.stringify(value), 'ironfishaccount00000')
  }

  decode(value: string): AccountImport {
    const [decoded, _] = Bech32m.decode(value)
    if (!decoded) {
      throw new EncodingError('Invalid bech32 JSON encoding')
    }
    return JSON.parse(decoded) as AccountImport
  }
}
