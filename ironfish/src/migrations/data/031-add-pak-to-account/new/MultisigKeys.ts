/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../../../storage'

export class MultisigKeysEncoding implements IDatabaseEncoding<MultisigKeys> {
  serialize(value: MultisigKeys): Buffer {
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!isSignerMultisig(value)) << 0
    bw.writeU8(flags)

    bw.writeVarBytes(Buffer.from(value.publicKeyPackage, 'hex'))
    if (isSignerMultisig(value)) {
      bw.writeVarBytes(Buffer.from(value.secret, 'hex'))
      bw.writeVarBytes(Buffer.from(value.keyPackage, 'hex'))
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): MultisigKeys {
    const reader = bufio.read(buffer, true)

    const flags = reader.readU8()
    const isSigner = flags & (1 << 0)

    const publicKeyPackage = reader.readVarBytes().toString('hex')
    if (isSigner) {
      const secret = reader.readVarBytes().toString('hex')
      const keyPackage = reader.readVarBytes().toString('hex')
      return {
        publicKeyPackage,
        secret,
        keyPackage,
      }
    }

    return {
      publicKeyPackage,
    }
  }

  getSize(value: MultisigKeys): number {
    let size = 0
    size += 1 // flags

    size += bufio.sizeVarString(value.publicKeyPackage, 'hex')
    if (isSignerMultisig(value)) {
      size += bufio.sizeVarString(value.secret, 'hex')
      size += bufio.sizeVarString(value.keyPackage, 'hex')
    }

    return size
  }
}

export interface MultisigSigner {
  secret: string
  keyPackage: string
  publicKeyPackage: string
}

export interface MultisigCoordinator {
  publicKeyPackage: string
}

export type MultisigKeys = MultisigSigner | MultisigCoordinator

export function isSignerMultisig(multisigKeys: MultisigKeys): multisigKeys is MultisigSigner {
  return 'keyPackage' in multisigKeys && 'secret' in multisigKeys
}
