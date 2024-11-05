/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Migration014 } from './014-blockchain'
import { Migration015 } from './015-wallet'
import { Migration016 } from './016-sequence-to-tx'
import { Migration017 } from './017-sequence-encoding'
import { Migration018 } from './018-backfill-wallet-assets'
import { Migration019 } from './019-backfill-wallet-assets-from-chain'
import { Migration020 } from './020-backfill-null-asset-supplies'
import { Migration021 } from './021-add-version-to-accounts'
import { Migration022 } from './022-add-view-key-account'
import { Migration023 } from './023-wallet-optional-spending-key'
import { Migration024 } from './024-unspent-notes'
import { Migration025 } from './025-backfill-wallet-nullifier-to-transaction-hash'
import { Migration026 } from './026-timestamp-to-transactions'
import { Migration027 } from './027-account-created-at-block'
import { Migration028 } from './028-backfill-assets-owner'
import { Migration029 } from './029-backfill-assets-owner-wallet'
import { Migration030 } from './030-value-to-unspent-note'
import { Migration031 } from './031-add-pak-to-account'
import { Migration032 } from './032-add-account-scanning'
import { Migration033 } from './033-multisig-keys-identity'

export const MIGRATIONS = [
  Migration014,
  Migration015,
  Migration016,
  Migration017,
  Migration018,
  Migration019,
  Migration020,
  Migration021,
  Migration022,
  Migration023,
  Migration024,
  Migration025,
  Migration026,
  Migration027,
  Migration028,
  Migration029,
  Migration030,
  Migration031,
  Migration032,
  Migration033,
]
