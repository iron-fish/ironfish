/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { GetNoteWitnessResponse } from './getNoteWitness'

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
      const response = await routeTest.client
        .request<GetNoteWitnessResponse>('chain/getNoteWitness', { index })
        .waitForEnd()

      const witness = await chain.notes.witness(index)
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
})
