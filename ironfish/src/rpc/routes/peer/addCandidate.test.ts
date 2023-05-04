/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route peer/addCandidate', () => {
  const routeTest = createRouteTest()

  it('should add a peer with a correct address and port', async () => {
    const request = { host: 'testhost', port: 9037 }

    const response = await routeTest.client.request('peer/addCandidate', request).waitForEnd()

    expect(
      routeTest.node.peerNetwork.peerManager.peerCandidates.has('ws://testhost:9037'),
    ).toBe(true)

    expect(response.content).toMatchObject({
      added: true,
    })
  })
})
