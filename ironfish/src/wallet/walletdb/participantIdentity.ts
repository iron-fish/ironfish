/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { IDatabaseEncoding } from '../../storage/database/types'
import { multisig } from '@ironfish/rust-nodejs'
import bufio from 'bufio'

export interface ParticipantIdentity {
  identity: Buffer
}

export class ParticipantIdentityEncoding implements IDatabaseEncoding<ParticipantIdentity> {
  serialize(value: ParticipantIdentity): Buffer {
    const bw = bufio.write(this.getSize(value))

    const flags = 0
    bw.writeU8(flags)

    bw.writeBytes(value.identity)
    return bw.render()
  }

  deserialize(buffer: Buffer): ParticipantIdentity {
    const reader = bufio.read(buffer, true)

    //flags
    reader.readU8()

    const identity = reader.readBytes(multisig.IDENTITY_LEN)
    return {
      identity,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getSize(value: ParticipantIdentity): number {
    let size = 0
    size += 1 // flags

    size += multisig.IDENTITY_LEN // owner
    return size
  }
}
