/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../matchers/blockchain'
import { Target } from '../../primitives/target'

export function acceptsAllTarget(): Target {
  return new Target(BigInt(2) ** BigInt(256) - BigInt(1))
}
