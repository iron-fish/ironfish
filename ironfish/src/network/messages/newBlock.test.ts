/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SerializedBlock } from '../../primitives/block'
import { NewBlockMessage } from './newBlock'

describe('NewBlocksMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const nonce = Buffer.alloc(16, 2)
    const message = new NewBlockMessage(
      {
        header: {
          graffiti: Buffer.alloc(32, 'graffiti1', 'utf8').toString('hex'),
          minersFee: '0',
          noteCommitment: {
            commitment: Buffer.alloc(32, 1),
            size: 1,
          },
          nullifierCommitment: {
            commitment: Buffer.alloc(32, 2).toString('hex'),
            size: 2,
          },
          previousBlockHash: Buffer.alloc(32, 2).toString('hex'),
          randomness: '1',
          sequence: 2,
          target: '12',
          timestamp: 200000,
        },
        transactions: [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')],
      },
      nonce,
    )
    const buffer = message.serialize()
    const deserializedMessage = NewBlockMessage.deserialize(buffer, nonce)
    expect(deserializedMessage).toEqual(message)
  })

  it('strips optional work and hash fields when serializing', () => {
    const nonce = Buffer.alloc(16, 3)
    const serializedBlock: SerializedBlock = {
      header: {
        graffiti: Buffer.alloc(32, 'graffiti1', 'utf8').toString('hex'),
        minersFee: '0',
        noteCommitment: {
          commitment: Buffer.alloc(32, 4),
          size: 1,
        },
        nullifierCommitment: {
          commitment: Buffer.alloc(32, 6).toString('hex'),
          size: 2,
        },
        previousBlockHash: Buffer.alloc(32, 2).toString('hex'),
        randomness: '1',
        sequence: 2,
        target: '12',
        timestamp: 200000,
        work: '123',
        hash: 'ramen',
      },
      transactions: [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')],
    }

    const message = new NewBlockMessage(serializedBlock, nonce)
    const buffer = message.serialize()
    const deserializedMessage = NewBlockMessage.deserialize(buffer, nonce)

    delete serializedBlock.header.hash
    delete serializedBlock.header.work

    expect(deserializedMessage.block).toEqual(serializedBlock)
  })
})
