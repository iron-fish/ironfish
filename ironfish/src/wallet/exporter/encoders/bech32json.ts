/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Bech32m } from '../../../utils'
import { AccountImport } from '../accountImport'
import { AccountDecodingOptions, AccountEncoder, DecodeFailed } from '../encoder'
import { JsonEncoder } from './json'
export class Bech32JsonEncoder implements AccountEncoder {
  /**
   * @deprecated Bech32 JSON encoding is deprecated. Use the newest version of the Bech32JSONEncoder.
   */
  encode(value: AccountImport): string {
    return Bech32m.encode(new JsonEncoder().encode(value), 'ironfishaccount00000')
  }

  decode(value: string, options?: AccountDecodingOptions): AccountImport {
    const [decoded, err] = Bech32m.decode(value)
    if (!decoded) {
      throw new DecodeFailed(
        `Invalid bech32 JSON encoding: ${err?.message || ''}`,
        this.constructor.name,
      )
    }
    const accountImport = new JsonEncoder().decode(decoded)
    return {
      ...accountImport,
      name: options?.name ? options.name : accountImport.name,
    }
  }
}
