/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import MurmurHash3 from 'imurmurhash'
import { SerializedAccount } from './accountsdb'

export class Account {
  readonly displayName: string
  name: string
  readonly spendingKey: string
  readonly incomingViewKey: string
  readonly outgoingViewKey: string
  publicAddress: string
  rescan: number | null

  constructor(serializedAccount: SerializedAccount) {
    this.name = serializedAccount.name
    this.spendingKey = serializedAccount.spendingKey
    this.incomingViewKey = serializedAccount.incomingViewKey
    this.outgoingViewKey = serializedAccount.outgoingViewKey
    this.publicAddress = serializedAccount.publicAddress
    this.rescan = serializedAccount.rescan

    const prefixHash = new MurmurHash3(this.spendingKey, 1)
      .hash(this.incomingViewKey)
      .hash(this.outgoingViewKey)
      .result()
      .toString(16)
    const hashSlice = prefixHash.slice(0, 7)
    this.displayName = `${this.name} (${hashSlice})`
  }

  serialize(): SerializedAccount {
    return {
      name: this.name,
      spendingKey: this.spendingKey,
      incomingViewKey: this.incomingViewKey,
      outgoingViewKey: this.outgoingViewKey,
      publicAddress: this.publicAddress,
      rescan: this.rescan,
    }
  }
}
