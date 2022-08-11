/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export type SnapshotManifest = {
  block_sequence: number
  checksum: string
  file_name: string
  file_size: number
  timestamp: number
  database_version: number
}
