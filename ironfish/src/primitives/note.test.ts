/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { useAccountFixture, useMinerBlockFixture } from '../testUtilities/fixtures'
import { createNodeTest } from '../testUtilities/nodeTest'

describe('Note', () => {
  const nodeTest = createNodeTest()

  it('should post', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const block = await useMinerBlockFixture(nodeTest.chain, undefined, account)

    const encrypted = block.minersFee.notes[0]
    const decrypted = encrypted.decryptNoteForOwner(account.incomingViewKey)

    Assert.isNotUndefined(decrypted)
    expect(encrypted.hash().equals(decrypted.hash())).toBe(true)
  })
})
