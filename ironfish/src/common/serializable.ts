/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'

export interface Serializable {
  serialize(): Buffer
  deserialize(buffer: Buffer): Serializable
  getSize(): number
}
