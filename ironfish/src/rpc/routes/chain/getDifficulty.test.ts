/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/getDifficulty', () => {
  const routeTest = createRouteTest()

  it('get difficulty', async () => {
    expect(routeTest.chain.head.hash.equals(routeTest.chain.genesis.hash)).toBe(true)

    const response = await routeTest.client.chain.getDifficulty()

    expect(response.content).toMatchObject({
      difficulty: routeTest.chain.genesis.target.toDifficulty().toString(),
      sequence: routeTest.chain.genesis.sequence,
      hash: routeTest.chain.genesis.hash.toString('hex'),
    })
  })

  it('get difficulty by sequence', async () => {
    expect(routeTest.chain.head.hash.equals(routeTest.chain.genesis.hash)).toBe(true)

    const response = await routeTest.client.chain.getDifficulty({
      sequence: routeTest.chain.genesis.sequence,
    })

    expect(response.content).toMatchObject({
      difficulty: routeTest.chain.genesis.target.toDifficulty().toString(),
      sequence: routeTest.chain.genesis.sequence,
      hash: routeTest.chain.genesis.hash.toString('hex'),
    })
  })
})
