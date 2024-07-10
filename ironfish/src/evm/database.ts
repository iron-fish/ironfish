/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BatchDBOp, DB, EncodingOpts } from '@ethereumjs/util'
import { BatchOperation, IDatabase, IDatabaseEncoding, IDatabaseStore } from '../storage'

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

  async get(key: string, _encodingOpts?: EncodingOpts): Promise<Uint8Array | undefined> {
    return this.store.get(key)
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    return this.store.put(key, Buffer.from(value))
  }

  async del(key: string): Promise<void> {
    return this.store.del(key)
  }

  async batch(opStack: BatchDBOp<string, Uint8Array>[]): Promise<void> {
    const writes: BatchOperation<EvmStateSchema, string, Uint8Array>[] = []
    for (const op of opStack) {
      if (op.type === 'put') {
        writes.push([this.store, op.key, op.value])
      } else if (op.type === 'del') {
        writes.push([this.store, op.key])
      }
    }
    await this.db.batch(writes)
  }

  shallowCopy(): EvmStateDB {
    return this
  }

  async open(): Promise<void> {
    await this.db.open()
  }
}
