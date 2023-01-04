/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useMinerBlockFixture } from '../../testUtilities'
import { BufferUtils } from '../../utils/buffer'
import { BalanceValue, BalanceValueEncoding } from './balanceValue'

describe('BalanceValueEncoding', () => {
  const nodeTest = createNodeTest()

  function expectBalanceValueToMatch(a: BalanceValue, b: BalanceValue): void {
    expect(a.unconfirmed).toEqual(b.unconfirmed)
    expect(BufferUtils.equalsNullable(a.blockHash, b.blockHash)).toBe(true)
    expect(a.sequence).toEqual(b.sequence)
  }

  describe('with a null block hash and sequence', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new BalanceValueEncoding()

      const balanceValue = {
        unconfirmed: 0n,
        blockHash: null,
        sequence: null,
      }

      const buffer = encoder.serialize(balanceValue)
      const deserializedValue = encoder.deserialize(buffer)
      expectBalanceValueToMatch(deserializedValue, balanceValue)
    })
  })

  describe('with all fields defined', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const { node } = nodeTest
      const block = await useMinerBlockFixture(node.chain)

      const encoder = new BalanceValueEncoding()

      const balanceValue = {
        unconfirmed: 0n,
        blockHash: block.header.hash,
        sequence: block.header.sequence,
      }

      const buffer = encoder.serialize(balanceValue)
      const deserializedValue = encoder.deserialize(buffer)
      expectBalanceValueToMatch(deserializedValue, balanceValue)
    })
  })
})
