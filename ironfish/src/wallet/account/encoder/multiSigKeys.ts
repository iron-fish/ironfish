/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../../storage'
import { MultiSigKeys, MultiSigSigner } from '../../interfaces/multiSigKeys'

export class MultiSigKeysEncoding implements IDatabaseEncoding<MultiSigKeys> {
  serialize(value: MultiSigKeys): Buffer {
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!isSignerMultiSig(value)) << 0
    bw.writeU8(flags)

    bw.writeVarBytes(Buffer.from(value.publicKeyPackage, 'hex'))
    if (isSignerMultiSig(value)) {
      bw.writeVarBytes(Buffer.from(value.identifier, 'hex'))
      bw.writeVarBytes(Buffer.from(value.keyPackage, 'hex'))
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): MultiSigKeys {
    const reader = bufio.read(buffer, true)

    const flags = reader.readU8()
    const isSigner = flags & (1 << 0)

    const publicKeyPackage = reader.readVarBytes().toString('hex')
    if (isSigner) {
      const identifier = reader.readVarBytes().toString('hex')
      const keyPackage = reader.readVarBytes().toString('hex')
      return {
        publicKeyPackage,
        identifier,
        keyPackage,
      }
    }

    return {
      publicKeyPackage,
    }
  }

  getSize(value: MultiSigKeys): number {
    let size = 0
    size += 1 // flags

    size += bufio.sizeVarString(value.publicKeyPackage, 'hex')
    if (isSignerMultiSig(value)) {
      size += bufio.sizeVarString(value.identifier, 'hex')
      size += bufio.sizeVarString(value.keyPackage, 'hex')
    }

    return size
  }
}

export function isSignerMultiSig(multiSigKeys: MultiSigKeys): multiSigKeys is MultiSigSigner {
  return 'keyPackage' in multiSigKeys && 'identifier' in multiSigKeys
}
