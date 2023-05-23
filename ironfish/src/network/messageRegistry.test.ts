/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { parseNetworkMessage } from './messageRegistry'
import { IdentifyMessage } from './messages/identify'
import { defaultFeatures } from './peers/peerFeatures'

describe('messageRegistry', () => {
  describe('parseNetworkMessage', () => {
    describe('with a malformed header', () => {
      it('throws an error', () => {
        expect(() => parseNetworkMessage(Buffer.from(''))).toThrow()
      })
    })

    describe('with a malformed body', () => {
      it('throws an error', () => {
        const message = new IdentifyMessage({
          agent: '',
          head: Buffer.alloc(32, 0),
          identity: 'identity',
          port: 9033,
          sequence: 1,
          version: 0,
          work: BigInt(0),
          networkId: 0,
          genesisBlockHash: Buffer.alloc(32, 0),
          features: defaultFeatures(),
        })
        jest.spyOn(message, 'serialize').mockImplementationOnce(() => Buffer.from('adsf'))

        expect(() => parseNetworkMessage(message.serialize())).toThrow()
      })
    })

    describe('with a valid message', () => {
      it('parses the message', () => {
        const message = new IdentifyMessage({
          agent: '',
          head: Buffer.alloc(32, 0),
          identity: Buffer.alloc(32, 'identity').toString('base64'),
          port: 9033,
          sequence: 1,
          version: 0,
          work: BigInt(0),
          networkId: 0,
          genesisBlockHash: Buffer.alloc(32, 0),
          features: defaultFeatures(),
        })

        expect(parseNetworkMessage(message.serialize())).toEqual(message)
      })
    })
  })
})
