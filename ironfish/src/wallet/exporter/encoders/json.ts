/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { deserializeRpcAccountImport } from '../../../rpc/routes/wallet/serializers'
import { RpcAccountImport } from '../../../rpc/routes/wallet/types'
import { validateAccount } from '../../validator'
import { AccountImport } from '../accountImport'
import { AccountDecodingOptions, AccountEncoder, DecodeFailed } from '../encoder'

export class JsonEncoder implements AccountEncoder {
  encode(value: AccountImport): string {
    let createdAt = null
    if (value.createdAt) {
      createdAt = {
        hash: value.createdAt.hash.toString('hex'),
        sequence: value.createdAt.sequence,
      }
    }
    return JSON.stringify({ ...value, createdAt })
  }

  decode(value: string, options?: AccountDecodingOptions): AccountImport {
    let account: RpcAccountImport
    try {
      account = JSON.parse(value) as RpcAccountImport
      const accountImport = deserializeRpcAccountImport(account)

      if (options?.name) {
        accountImport.name = options.name
      }

      validateAccount(accountImport)
      return accountImport
    } catch (e) {
      throw new DecodeFailed(`Invalid JSON: ${(e as Error).message}`, this.constructor.name)
    }
  }
}
