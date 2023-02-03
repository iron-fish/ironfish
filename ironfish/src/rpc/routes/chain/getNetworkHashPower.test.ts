/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { ERROR_CODES } from '../../adapters'

describe('Route chain/getNetworkHashPower', () => {
  const routeTest = createRouteTest(true)
  let sender: Account

  beforeAll(async () => {
    sender = await useAccountFixture(routeTest.node.wallet, 'existingAccount')
  })

  it('should succeed with default values', async () => {
    for (let i = 0; i < 5; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])
      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    await expect(routeTest.client.getNetworkHashPower({})).resolves.toMatchObject({
      hashesPerSecond: expect.any(Number),
    })
  })

  it('should fail with a negative lookup value', async () => {
    await expect(
      routeTest.client.getNetworkHashPower({
        lookup: -1,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Lookup value must be greater than 0'),
        status: 400,
        code: ERROR_CODES.VALIDATION,
      }),
    )
  })

  it('should return 0 network hash power if start block == end block', async () => {
    await expect(
      routeTest.client.getNetworkHashPower({
        lookup: 1,
        height: 1,
      }),
    ).resolves.toMatchObject({
      hashesPerSecond: 0,
    })
  })
})
