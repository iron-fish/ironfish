/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, Note as NativeNote } from '@ironfish/rust-nodejs'
import { createNodeTest, useAccountFixture } from '../testUtilities'
import { Note } from './note'

describe('Note', () => {
  const nodeTest = createNodeTest()

  it('calculates merkle root with 0 transactions', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const native = new NativeNote(
      account.publicAddress,
      5n,
      'memo',
      Asset.nativeIdentifier(),
      account.spendingKey,
    )

    const note = new Note(native.serialize())

    expect(note.serialize().equals(native.serialize())).toBe(true)
  })
})
