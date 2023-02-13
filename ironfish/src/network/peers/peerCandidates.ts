/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConnectionRetry } from './connectionRetry'

export type PeerCandidate = {
  name?: string
  address: string | null
  port: number | null
  neighbors: Set<string>
  webRtcRetry: ConnectionRetry
  websocketRetry: ConnectionRetry
  /**
   * UTC timestamp. If set, the peer manager should not initiate connections to the
   * Peer until after the timestamp.
   */
  peerRequestedDisconnectUntil: number | null
  /**
   * UTC timestamp. If set, the peer manager should not accept connections from the
   * Peer until after the timestamp.
   */
  localRequestedDisconnectUntil: number | null
}

export class PeerCandidates {
  map: Map<string, PeerCandidate> = new Map()

  get(identity: string): PeerCandidate | undefined {
    return this.map.get(identity)
  }

  set(identity: string, value: PeerCandidate): void {
    this.map.set(identity, value)
  }
}
