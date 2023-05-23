/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { serializePayloadToBuffer } from '../../testUtilities'
import { identityLength } from '../identity'
import { defaultFeatures } from '../peers/peerFeatures'
import { IdentifyMessage } from './identify'

describe('IdentifyMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new IdentifyMessage({
      agent: 'agent👁️🏃🐟',
      head: Buffer.alloc(32, 'head'),
      identity: Buffer.alloc(identityLength, 'identity').toString('base64'),
      name: 'name👁️🏃🐟',
      port: 9033,
      sequence: 1,
      version: 1,
      work: BigInt('123'),
      networkId: 0,
      genesisBlockHash: Buffer.alloc(32, 0),
      features: defaultFeatures(),
    })

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = IdentifyMessage.deserializePayload(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
