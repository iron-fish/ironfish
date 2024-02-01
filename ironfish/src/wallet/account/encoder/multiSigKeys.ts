/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../../storage'
import { MultiSigCoordinator, MultiSigKeys } from '../../interfaces/multiSigKeys'

export class NullableMultiSigKeysEncoding implements IDatabaseEncoding<MultiSigKeys | null> {
  serialize(value: MultiSigKeys | null): Buffer {
    const bw = bufio.write(this.getSize(value))

    if (value) {
      let flags = 0
      flags |= Number(!!isCoordinatorMultiSig(value)) << 0
      bw.writeU8(flags)

      if (isCoordinatorMultiSig(value)) {
        bw.writeVarBytes(Buffer.from(value.publicKeyPackage, 'hex'))
      } else {
        bw.writeVarBytes(Buffer.from(value.identifier, 'hex'))
        bw.writeVarBytes(Buffer.from(value.keyPackage, 'hex'))
        bw.writeVarBytes(Buffer.from(value.proofGenerationKey, 'hex'))
      }
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): MultiSigKeys | null {
    const reader = bufio.read(buffer, true)

    if (reader.left()) {
      const flags = reader.readU8()
      const isCoordinator = flags & (1 << 0)

      if (isCoordinator) {
        const identifier = reader.readVarBytes().toString('hex')
        const keyPackage = reader.readVarBytes().toString('hex')
        const proofGenerationKey = reader.readVarBytes().toString('hex')
        return {
          identifier,
          keyPackage,
          proofGenerationKey,
        }
      }

      const publicKeyPackage = reader.readVarBytes().toString('hex')
      return { publicKeyPackage }
    }

    return null
  }

  getSize(value: MultiSigKeys | null): number {
    if (!value) {
      return 0
    }

    let size = 0
    size += 1 // flags

    if (isCoordinatorMultiSig(value)) {
      size += bufio.sizeVarString(value.publicKeyPackage, 'hex')
    } else {
      size += bufio.sizeVarString(value.identifier, 'hex')
      size += bufio.sizeVarString(value.keyPackage, 'hex')
      size += bufio.sizeVarString(value.proofGenerationKey, 'hex')
    }

    return size
  }
}

export function isCoordinatorMultiSig(
  multiSigKeys: MultiSigKeys,
): multiSigKeys is MultiSigCoordinator {
  return 'publicKeyPackage' in multiSigKeys
}
