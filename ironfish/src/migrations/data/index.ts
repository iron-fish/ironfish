/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Migration014 } from './014-blockchain'
import { Migration015 } from './015-wallet'
import { Migration016 } from './016-sequence-to-tx'
import { Migration017 } from './017-sequence-encoding'
import { Migration018 } from './018-backfill-wallet-assets'

export const MIGRATIONS = [Migration014, Migration015, Migration016, Migration017, Migration018]
