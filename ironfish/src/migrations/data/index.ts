/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Migration010 } from './010-blockchain'
import { Migration011 } from './011-accounts'
import { Migration012 } from './012-indexer'

export const MIGRATIONS = [Migration010, Migration011, Migration012]
