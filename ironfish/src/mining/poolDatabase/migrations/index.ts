/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Migration001 from './001-initial'
import Migration002 from './002-add-shares-index'
import Migration003 from './003-add-transaction-hash'
import Migration004 from './004-add-shares-address-index'
import Migration005 from './005-add-payout-period-table'
import Migration006 from './006-add-block-table'
import Migration007 from './007-add-payout-transaction-table'
import Migration008 from './008-add-payout-share-table'
import Migration009 from './009-remove-old-tables'

export const MIGRATIONS = [
  Migration001,
  Migration002,
  Migration003,
  Migration004,
  Migration005,
  Migration006,
  Migration007,
  Migration008,
  Migration009,
]
