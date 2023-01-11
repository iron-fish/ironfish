/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Migration014 } from './014-blockchain'
import { Migration015 } from './015-wallet'

export const MIGRATIONS = [Migration014, Migration015]
