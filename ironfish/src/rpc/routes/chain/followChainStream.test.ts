/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useMinerBlockFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { MemoryResponse } from '../../adapters'

describe('Route chain/followChainStream', () => {
  const routeTest = createRouteTest()

  let chainStream: MemoryResponse<unknown, unknown> | undefined

  afterEach(() => {
    chainStream?.close()
  })

  it('correctly streams connected events', async () => {
    const { chain } = routeTest
    await chain.open()

    const blockA1 = await useMinerBlockFixture(chain)

    await expect(chain).toAddBlock(blockA1)

    chainStream = routeTest.client.request('chain/followChainStream', {})

    let streamed = await chainStream.contentStream().next()
    expect(streamed?.value).toMatchObject({
      type: 'connected',
      block: { hash: chain.genesis.hash.toString('hex') },
    })

    streamed = await chainStream.contentStream().next()
    expect(streamed?.value).toMatchObject({
      type: 'connected',
      block: { hash: blockA1.header.hash.toString('hex') },
    })
  })

  it('returns full transactions when requested', async () => {
    const { chain } = routeTest
    await chain.open()

    const blockA1 = await useMinerBlockFixture(chain)

    await expect(chain).toAddBlock(blockA1)

    chainStream = routeTest.client.request('chain/followChainStream', { serialized: true })

    let streamed = await chainStream.contentStream().next()
    expect(streamed?.value).toMatchObject({
      type: 'connected',
      block: { hash: chain.genesis.hash.toString('hex') },
    })

    streamed = await chainStream.contentStream().next()
    expect(streamed?.value).toMatchObject({
      type: 'connected',
      block: {
        hash: blockA1.header.hash.toString('hex'),
        transactions: [{ serialized: blockA1.transactions[0].serialize().toString('hex') }],
      },
    })
  })

  it('ends the stream if the limit is reached', async () => {
    const { chain } = routeTest
    await chain.open()

    const blockA1 = await useMinerBlockFixture(chain)

    await expect(chain).toAddBlock(blockA1)

    const blockA2 = await useMinerBlockFixture(chain)

    await expect(chain).toAddBlock(blockA2)

    chainStream = routeTest.client.request('chain/followChainStream', { limit: 1 })

    let streamed = await chainStream.contentStream().next()
    expect(streamed?.value).toMatchObject({
      type: 'connected',
      block: { hash: chain.genesis.hash.toString('hex') },
    })

    streamed = await chainStream.contentStream().next()
    expect(streamed?.value).toBeUndefined()
    expect(streamed?.done).toBe(true)
  })
})
