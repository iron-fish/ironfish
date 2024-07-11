/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BatchDBOp, DB, EncodingOpts } from '@ethereumjs/util'
import { IDatabase, IDatabaseEncoding, IDatabaseStore, IDatabaseTransaction } from '../storage'

type EvmStateSchema = {
  key: string
  value: Uint8Array
}

export class HexStringEncoding implements IDatabaseEncoding<string> {
  serialize = (value: string): Buffer => Buffer.from(value, 'hex')
  deserialize = (buffer: Buffer): string => buffer.toString('hex')
}

class EvmStateEncoding implements IDatabaseEncoding<Uint8Array> {
  serialize = (value: Uint8Array): Buffer => Buffer.from(value)
  deserialize = (buffer: Buffer): Uint8Array => buffer
}

export class EvmStateDB implements DB<string, Uint8Array> {
  db: IDatabase
  store: IDatabaseStore<EvmStateSchema>

  constructor(db: IDatabase) {
    this.db = db
    this.store = this.db.addStore({
      name: 'evm',
      keyEncoding: new HexStringEncoding(),
      valueEncoding: new EvmStateEncoding(),
    })
  }

  get(
    key: string,
    _opts?: EncodingOpts | undefined,
    tx?: IDatabaseTransaction,
  ): Promise<Uint8Array | undefined> {
    return this.store.get(key, tx)
  }
  put(
    key: string,
    val: Uint8Array,
    _opts?: EncodingOpts | undefined,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.store.put(key, val, tx)
  }
  del(key: string, _opts?: EncodingOpts | undefined, tx?: IDatabaseTransaction): Promise<void> {
    return this.store.del(key, tx)
  }

  batch(opStack: BatchDBOp<string, Uint8Array>[], tx?: IDatabaseTransaction): Promise<void> {
    return this.db.withTransaction(tx, async (tx) => {
      for (const op of opStack) {
        if (op.type === 'put') {
          await this.put(op.key, op.value, undefined, tx)
        } else if (op.type === 'del') {
          await this.del(op.key, undefined, tx)
        }
      }
    })
  }

  shallowCopy(): DB<string, Uint8Array> {
    return new EvmStateDB(this.db)
  }

  open(): Promise<void> {
    return this.db.open()
  }
}
