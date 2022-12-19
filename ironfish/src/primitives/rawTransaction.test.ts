/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey, Note as NativeNote } from '@ironfish/rust-nodejs'
import { Witness } from '../merkletree'
import { NoteHasher } from '../merkletree/hasher'
import { Side } from '../merkletree/merkletree'
import { IsNoteWitnessEqual } from '../merkletree/witness'
import { useAccountFixture } from '../testUtilities/fixtures'
import { createNodeTest } from '../testUtilities/nodeTest'
import { Note } from './note'
import { RawTransaction, RawTransactionSerde } from './rawTransaction'

describe('RawTransaction', () => {
  const nodeTest = createNodeTest()

  describe('RawTransactionSerde', () => {
    it('serializes and deserializes a block', async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const asset = new Asset(account.spendingKey, 'asset', 'metadata')

      const note = new Note(
        new NativeNote(
          generateKey().public_address,
          5n,
          'memo',
          asset.identifier(),
          account.publicAddress,
        ).serialize(),
      )

      const witness = new Witness(
        0,
        Buffer.alloc(32, 1),
        [
          { side: Side.Left, hashOfSibling: Buffer.alloc(32, 1) },
          { side: Side.Right, hashOfSibling: Buffer.alloc(32, 2) },
          { side: Side.Left, hashOfSibling: Buffer.alloc(32, 3) },
        ],
        new NoteHasher(),
      )

      const raw = new RawTransaction()
      raw.spendingKey = account.spendingKey
      raw.expirationSequence = 60
      raw.fee = 1337n

      raw.mints = [
        {
          asset: asset,
          value: 5n,
        },
      ]

      raw.burns = [
        {
          assetIdentifier: asset.identifier(),
          value: 5n,
        },
      ]

      raw.receives = [
        {
          note: note,
        },
      ]

      raw.spends = [{ note, witness }]

      const serialized = RawTransactionSerde.serialize(raw)
      const deserialized = RawTransactionSerde.deserialize(serialized)

      expect(deserialized).toMatchObject({
        spendingKey: raw.spendingKey,
        expirationSequence: raw.expirationSequence,
        fee: raw.fee,
      })

      expect(deserialized.receives[0].note).toEqual(raw.receives[0].note)
      expect(deserialized.burns[0].assetIdentifier).toEqual(asset.identifier())
      expect(deserialized.burns[0].value).toEqual(5n)
      expect(deserialized.mints[0].asset.serialize()).toEqual(asset.serialize())
      expect(deserialized.mints[0].value).toEqual(5n)
      expect(deserialized.spends[0].note).toEqual(raw.spends[0].note)
      expect(IsNoteWitnessEqual(deserialized.spends[0].witness, raw.spends[0].witness)).toBe(
        true,
      )
    })
  })
})
