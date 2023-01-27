/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export interface TransactionAmountsValue {
  input: bigint
  output: bigint
}

export class TransactionAmountsValueEncoding
  implements IDatabaseEncoding<TransactionAmountsValue>
{
  serialize(value: TransactionAmountsValue): Buffer {
    const bw = bufio.write(16)

    bw.writeBigU64(value.input)
    bw.writeBigU64(value.output)

    return bw.render()
  }

  deserialize(buffer: Buffer): TransactionAmountsValue {
    const reader = bufio.read(buffer, true)

    const input = reader.readBigU64()
    const output = reader.readBigU64()

    return { input, output }
  }
}
