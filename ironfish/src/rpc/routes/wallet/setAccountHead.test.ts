/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/setAccountHead', () => {
  const routeTest = createRouteTest()

  describe('Updates the account head and adds transactions', () => {
    it('Succeeds when start is genesis block', async () => {
      const account = await useAccountFixture(routeTest.wallet, 'foo')
      const block = await useMinerBlockFixture(routeTest.chain, undefined, account)
      await expect(routeTest.chain).toAddBlock(block)
      expect((await routeTest.wallet.getBalance(account, Asset.nativeId())).available).toBe(0n)

      await account.updateScanningEnabled(false)

      const response = await routeTest.client.wallet.setAccountHead({
        account: account.name,
        start: routeTest.chain.genesis.hash.toString('hex'),
        end: block.header.hash.toString('hex'),
        blocks: [
          {
            hash: block.header.hash.toString('hex'),
            transactions: [{ hash: block.transactions[0].hash().toString('hex') }],
          },
        ],
      })

      expect(response.status).toBe(200)
      expect((await account.getHead())?.hash).toEqualBuffer(block.header.hash)
      expect((await routeTest.wallet.getBalance(account, Asset.nativeId())).available).toBe(
        2000000000n,
      )
    })

    it('Succeeds when start is non-genesis block', async () => {
      const account = await useAccountFixture(routeTest.wallet, 'foo')
      await routeTest.wallet.scan()
      expect((await account.getHead())?.hash).toEqualBuffer(routeTest.chain.genesis.hash)

      const block1 = await useMinerBlockFixture(routeTest.chain)
      await expect(routeTest.chain).toAddBlock(block1)

      const block2 = await useMinerBlockFixture(routeTest.chain, undefined, account)
      await expect(routeTest.chain).toAddBlock(block2)
      expect((await routeTest.wallet.getBalance(account, Asset.nativeId())).available).toBe(0n)

      await account.updateScanningEnabled(false)

      const response = await routeTest.client.wallet.setAccountHead({
        account: account.name,
        start: block1.header.hash.toString('hex'),
        end: block2.header.hash.toString('hex'),
        blocks: [
          {
            hash: block2.header.hash.toString('hex'),
            transactions: [{ hash: block2.transactions[0].hash().toString('hex') }],
          },
        ],
      })

      expect(response.status).toBe(200)
      expect((await account.getHead())?.hash).toEqualBuffer(block2.header.hash)
      expect((await routeTest.wallet.getBalance(account, Asset.nativeId())).available).toBe(
        2000000000n,
      )
    })
  })

  it('throws if start or end hashes not in chain', async () => {
    const account = await useAccountFixture(routeTest.wallet, 'foo')

    await expect(() =>
      routeTest.client.wallet.setAccountHead({
        account: account.name,
        start: 'fff',
        end: 'eee',
        blocks: [],
      }),
    ).rejects.toThrow('Start block is not on the head chain.')

    await expect(() =>
      routeTest.client.wallet.setAccountHead({
        account: account.name,
        start: routeTest.chain.genesis.hash.toString('hex'),
        end: 'eee',
        blocks: [],
      }),
    ).rejects.toThrow('End block is not on the head chain.')
  })

  it('throws if account scanning is enabled', async () => {
    const account = await useAccountFixture(routeTest.wallet, 'foo')

    await expect(() =>
      routeTest.client.wallet.setAccountHead({
        account: account.name,
        start: routeTest.chain.genesis.hash.toString('hex'),
        end: routeTest.chain.genesis.hash.toString('hex'),
        blocks: [],
      }),
    ).rejects.toThrow('Cannot set account head while account scanning is enabled.')
  })

  it('throws if account head is null and start is not genesis', async () => {
    const account = await useAccountFixture(routeTest.wallet, 'foo', { createdAt: null })
    const block = await useMinerBlockFixture(routeTest.chain, undefined, account)
    await expect(routeTest.chain).toAddBlock(block)
    await expect(account.getHead()).resolves.toBeNull()

    await account.updateScanningEnabled(false)

    await expect(() =>
      routeTest.client.wallet.setAccountHead({
        account: account.name,
        start: block.header.hash.toString('hex'),
        end: block.header.hash.toString('hex'),
        blocks: [
          {
            hash: block.header.hash.toString('hex'),
            transactions: [{ hash: block.transactions[0].hash().toString('hex') }],
          },
        ],
      }),
    ).rejects.toThrow(
      `Start must be ${routeTest.chain.genesis.hash.toString('hex')} if account head is null`,
    )
  })

  it('throws if gap between start and account head', async () => {
    const account = await useAccountFixture(routeTest.wallet, 'foo')
    await routeTest.wallet.scan()

    const block1 = await useMinerBlockFixture(routeTest.chain, undefined, account)
    await expect(routeTest.chain).toAddBlock(block1)
    const block2 = await useMinerBlockFixture(routeTest.chain, undefined, account)
    await expect(routeTest.chain).toAddBlock(block2)

    expect((await account.getHead())?.hash).toEqualBuffer(routeTest.chain.genesis.hash)

    await account.updateScanningEnabled(false)

    await expect(() =>
      routeTest.client.wallet.setAccountHead({
        account: account.name,
        start: block2.header.hash.toString('hex'),
        end: block2.header.hash.toString('hex'),
        blocks: [],
      }),
    ).rejects.toThrow(`Start must be ${block1.header.hash.toString('hex')} or earlier`)
  })

  it('accepts start blocks earlier than the account head', async () => {
    const account = await useAccountFixture(routeTest.wallet, 'foo')
    const block1 = await useMinerBlockFixture(routeTest.chain, undefined, account)
    await expect(routeTest.chain).toAddBlock(block1)
    await routeTest.wallet.scan()
    expect((await account.getHead())?.hash).toEqualBuffer(block1.header.hash)

    await account.updateScanningEnabled(false)

    const response = await routeTest.client.wallet.setAccountHead({
      account: account.name,
      start: routeTest.chain.genesis.hash.toString('hex'),
      end: block1.header.hash.toString('hex'),
      blocks: [
        {
          hash: block1.header.hash.toString('hex'),
          transactions: [{ hash: block1.transactions[0].hash().toString('hex') }],
        },
      ],
    })

    expect(response.status).toBe(200)
    expect((await account.getHead())?.hash).toEqualBuffer(block1.header.hash)
    expect((await routeTest.wallet.getBalance(account, Asset.nativeId())).available).toBe(
      2000000000n,
    )
  })

  it('accepts start blocks on a fork', async () => {
    const account = await useAccountFixture(routeTest.wallet, 'foo')

    const { node: node2 } = await routeTest.createSetup()
    const node2Block1 = await useMinerBlockFixture(node2.chain, undefined, account)
    await expect(node2.chain).toAddBlock(node2Block1)
    const node2Block2 = await useMinerBlockFixture(node2.chain, undefined, account)
    await expect(node2.chain).toAddBlock(node2Block2)

    const block1 = await useMinerBlockFixture(routeTest.chain)
    await expect(routeTest.chain).toAddBlock(block1)
    await routeTest.wallet.scan()
    expect((await account.getHead())?.hash).toEqualBuffer(block1.header.hash)

    await account.updateScanningEnabled(false)

    await expect(routeTest.chain).toAddBlock(node2Block1)
    await expect(routeTest.chain).toAddBlock(node2Block2)

    const response = await routeTest.client.wallet.setAccountHead({
      account: account.name,
      start: node2Block1.header.hash.toString('hex'),
      end: node2Block2.header.hash.toString('hex'),
      blocks: [
        {
          hash: node2Block1.header.hash.toString('hex'),
          transactions: [{ hash: node2Block1.transactions[0].hash().toString('hex') }],
        },
        {
          hash: node2Block2.header.hash.toString('hex'),
          transactions: [{ hash: node2Block2.transactions[0].hash().toString('hex') }],
        },
      ],
    })

    expect(response.status).toBe(200)
    expect((await account.getHead())?.hash).toEqualBuffer(node2Block2.header.hash)
    expect((await routeTest.wallet.getBalance(account, Asset.nativeId())).available).toBe(
      4000000000n,
    )
  })

  it('updates the account head to end', async () => {
    const account = await useAccountFixture(routeTest.wallet, 'foo')
    const block1 = await useMinerBlockFixture(routeTest.chain, undefined, account)
    await expect(routeTest.chain).toAddBlock(block1)
    const block2 = await useMinerBlockFixture(routeTest.chain)
    await expect(routeTest.chain).toAddBlock(block2)

    await account.updateScanningEnabled(false)

    const response = await routeTest.client.wallet.setAccountHead({
      account: account.name,
      start: routeTest.chain.genesis.hash.toString('hex'),
      end: block2.header.hash.toString('hex'),
      blocks: [
        {
          hash: block1.header.hash.toString('hex'),
          transactions: [{ hash: block1.transactions[0].hash().toString('hex') }],
        },
      ],
    })

    expect(response.status).toBe(200)
    expect((await account.getHead())?.hash).toEqualBuffer(block2.header.hash)
    expect((await routeTest.wallet.getBalance(account, Asset.nativeId())).available).toBe(
      2000000000n,
    )
  })
})
