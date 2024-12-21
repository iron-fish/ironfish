/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export interface MultisigIdentityValue {
  name: string
  /**
   * The secret is optional when a multisig account is generated on a Ledger device.
   * The secret never leaves the Ledger device.
   *
   * We use a zero buffer encoding approach for the optional 'secret' field:
   * - Present secret: written directly to buffer
   * - Undefined secret: zero buffer of same length written
   *
   * This approach maintains consistent serialized size and avoids database migrations,
   * while allowing distinction between undefined and actual secrets during deserialization.
   */
  secret?: Buffer
  ledger: boolean
}

export class MultisigIdentityValueEncoder implements IDatabaseEncoding<MultisigIdentityValue> {
  serialize(value: MultisigIdentityValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeVarString(value.name, 'utf-8')
    if (value.secret) {
      bw.writeBytes(value.secret)
    } else {
      // Write a zero buffer of the same length as the secret
      bw.writeBytes(Buffer.alloc(multisig.SECRET_LEN))
    }
    bw.writeU8(value.ledger ? 1 : 0)
    return bw.render()
  }

  deserialize(buffer: Buffer): MultisigIdentityValue {
    const reader = bufio.read(buffer, true)
    const name = reader.readVarString('utf-8')
    const secret = reader.readBytes(multisig.SECRET_LEN)
    const ledger = reader.readU8() === 1
    // Check if the secret is all zeros
    if (Buffer.compare(secret, Buffer.alloc(multisig.SECRET_LEN)) === 0) {
      return { name, secret: undefined, ledger }
    }
    return { name, secret, ledger }
  }

  getSize(value: MultisigIdentityValue): number {
    let size = 0
    size += bufio.sizeVarString(value.name, 'utf8')
    size += multisig.SECRET_LEN
    size += 1 // for ledger
    return size
  }
}
