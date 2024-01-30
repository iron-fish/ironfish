/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey, PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import {
  IDatabase,
  IDatabaseEncoding,
  IDatabaseStore,
  IDatabaseTransaction,
  StringEncoding,
} from '../../../storage'
import { Account } from '../../../wallet'
import { MigrationContext } from '../../migration'

const KEY_LENGTH = 32

export interface AccountValue {
  id: string
  name: string
  spendingKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
}

export class AccountValueEncoding implements IDatabaseEncoding<AccountValue> {
  serialize(value: AccountValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeVarString(value.id, 'utf8')
    bw.writeVarString(value.name, 'utf8')
    bw.writeBytes(Buffer.from(value.spendingKey, 'hex'))
    bw.writeBytes(Buffer.from(value.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.publicAddress, 'hex'))

    return bw.render()
  }

  deserialize(buffer: Buffer): AccountValue {
    const reader = bufio.read(buffer, true)
    const id = reader.readVarString('utf8')
    const name = reader.readVarString('utf8')
    const spendingKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

    return {
      id,
      name,
      spendingKey,
      incomingViewKey,
      outgoingViewKey,
      publicAddress,
    }
  }

  getSize(value: AccountValue): number {
    let size = 0
    size += bufio.sizeVarString(value.id, 'utf8')
    size += bufio.sizeVarString(value.name, 'utf8')
    size += KEY_LENGTH
    size += KEY_LENGTH
    size += KEY_LENGTH
    size += PUBLIC_ADDRESS_LENGTH

    return size
  }
}

export function GetOldStores(db: IDatabase): {
  accounts: IDatabaseStore<{ key: string; value: AccountValue }>
} {
  const accounts: IDatabaseStore<{ key: string; value: AccountValue }> = db.addStore(
    {
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    },
    false,
  )

  return { accounts }
}

export async function GetOldAccounts(
  context: MigrationContext,
  db: IDatabase,
  tx?: IDatabaseTransaction,
): Promise<Account[]> {
  const accounts = []
  const oldStores = GetOldStores(db)

  for await (const account of oldStores.accounts.getAllValuesIter(tx)) {
    const key = generateKeyFromPrivateKey(account.spendingKey)

    accounts.push(
      new Account({
        ...account,
        version: 1,
        proofAuthorizingKey: null,
        viewKey: key.viewKey,
        createdAt: null,
        walletDb: context.wallet.walletDb,
      }),
    )
  }

  return accounts
}
