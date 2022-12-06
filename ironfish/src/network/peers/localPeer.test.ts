/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mockLocalPeer } from '../testUtilities'

describe('LocalPeer', () => {
  describe('identify', () => {
    it('returns an identify message corresponding to the peer', () => {
      const peer = mockLocalPeer()
      const message = peer.getIdentifyMessage()
      expect(message).toMatchObject({
        agent: peer.agent,
        head: peer.chain.head.hash.toString('hex'),
        identity: peer.publicIdentity,
        sequence: Number(peer.chain.head.sequence),
        version: peer.version,
        work: peer.chain.head.work,
        networkId: peer.networkId,
        genesisBlockHash: peer.chain.genesis.hash,
      })
    })
  })
})
