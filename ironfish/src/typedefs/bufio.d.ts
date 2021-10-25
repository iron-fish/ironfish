/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

declare module 'bufio' {
  type Encoding = 'utf8' | 'ascii'

  class StaticWriter {
    writeU64(value: number): StaticWriter
    writeVarString(value: string, enc?: Encoding | null): StaticWriter
  }

  class BufferWriter {
    writeU64(value: number): BufferWriter
    writeVarString(value: string, enc?: Encoding | null): BufferWriter
  }

  export function write(size?: number): StaticWriter | BufferWriter
}
