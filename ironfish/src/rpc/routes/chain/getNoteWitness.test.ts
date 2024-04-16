/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { Witness } from '../../../merkletree'
import { NoteEncrypted } from '../../../primitives/noteEncrypted'
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/getNoteWitness', () => {
  const routeTest = createRouteTest()

  it('gets note witness for each note', async () => {
    const { chain } = routeTest
    await chain.open()

    const block1 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block1)
    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    const noteSize = await chain.notes.size()

    for (const index of Array.from(Array(noteSize).keys())) {
      const response = await routeTest.client.chain.getNoteWitness({ index })

      const witness: Witness<NoteEncrypted, Buffer, Buffer, Buffer> | null =
        await chain.notes.witness(index)
      Assert.isNotNull(witness)

      expect(response.content.rootHash).toEqual(witness.rootHash.toString('hex'))
      expect(response.content.treeSize).toEqual(witness.treeSize())

      const expectedAuthPath = witness.authenticationPath.map((step) => {
        return {
          side: step.side,
          hashOfSibling: step.hashOfSibling.toString('hex'),
        }
      })

      expect(response.content.authPath).toEqual(expectedAuthPath)
    }
  })

  it('gets note witness for each confirmed note using a confirmation range', async () => {
    const { chain } = routeTest
    await chain.open()

    const block1 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block1)
    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    const noteSize = block1.header.noteSize

    Assert.isNotNull(noteSize)

    const confirmations = 1

    for (let index = 0; index < noteSize; index++) {
      const response = await routeTest.client.chain.getNoteWitness({ index, confirmations })

      const witness: Witness<NoteEncrypted, Buffer, Buffer, Buffer> | null =
        await chain.notes.witness(index, noteSize)
      Assert.isNotNull(witness)

      expect(response.content.rootHash).toEqual(witness.rootHash.toString('hex'))
      expect(response.content.treeSize).toEqual(witness.treeSize())

      const expectedAuthPath = witness.authenticationPath.map((step) => {
        return {
          side: step.side,
          hashOfSibling: step.hashOfSibling.toString('hex'),
        }
      })

      expect(response.content.authPath).toEqual(expectedAuthPath)
    }

    const block2NoteSize = block2.header.noteSize
    Assert.isNotNull(block2NoteSize)

    // Notes on block2 are not confirmed
    for (let index = noteSize; index < block2NoteSize; index++) {
      await expect(
        routeTest.client.chain.getNoteWitness({ index, confirmations }),
      ).rejects.toThrow(`No confirmed notes exist with index ${index}`)
    }
  })
})
