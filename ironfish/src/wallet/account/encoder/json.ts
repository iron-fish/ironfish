/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcAccountImport } from '../../../rpc/routes/wallet/types'
import { validateAccount } from '../../validator'
import { AccountImport } from '../../walletdb/accountValue'
import { AccountDecodingOptions, AccountEncoder, DecodeFailed } from './encoder'

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
      if (account.createdAt && !account.createdAt.hash) {
        account.createdAt = null
      }
      const accountImport = {
        ...account,
        name: options?.name ? options.name : account.name,
        createdAt: account.createdAt
          ? {
              hash: Buffer.from(account.createdAt.hash, 'hex'),
              sequence: account.createdAt.sequence,
            }
          : null,
      }
      validateAccount(accountImport)
      return accountImport
    } catch (e) {
      throw new DecodeFailed(`Invalid JSON: ${(e as Error).message}`, this.constructor.name)
    }
  }
}
