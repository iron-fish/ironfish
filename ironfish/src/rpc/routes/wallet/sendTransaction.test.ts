/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { useAccountFixture, useMinersTxFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { RPC_ERROR_CODES } from '../../adapters'
import { RpcRequestError } from '../../clients'

const TEST_PARAMS = {
  account: 'existingAccount',
  outputs: [
    {
      publicAddress: 'test2',
      amount: BigInt(10).toString(),
      memo: '',
      assetId: Asset.nativeId().toString('hex'),
    },
  ],
  fee: BigInt(1).toString(),
}

const TEST_PARAMS_MULTI = {
  account: 'existingAccount',
  outputs: [
    {
      publicAddress: 'test2',
      amount: BigInt(10).toString(),
      memo: '',
      assetId: Asset.nativeId().toString('hex'),
    },
    {
      publicAddress: 'test3',
      amount: BigInt(10).toString(),
      memo: '',
      assetId: Asset.nativeId().toString('hex'),
    },
  ],
  fee: BigInt(1).toString(),
}

describe('Route wallet/sendTransaction', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.wallet.createAccount('existingAccount', { setDefault: true })
  })

  it('throws if account does not exist', async () => {
    await expect(
      routeTest.client.wallet.sendTransaction({
        ...TEST_PARAMS,
        account: 'AccountDoesNotExist',
      }),
    ).rejects.toThrow('No account with name AccountDoesNotExist')
  })

  it('throws if the chain is outdated', async () => {
    routeTest.chain.synced = false

    await expect(routeTest.client.wallet.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      'Your node must be synced with the Iron Fish network to send a transaction. Please try again later',
    )
  })

  it('throws if not enough funds', async () => {
    routeTest.chain.synced = true

    await expect(routeTest.client.wallet.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: RPC_ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )

    await expect(routeTest.client.wallet.sendTransaction(TEST_PARAMS_MULTI)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: RPC_ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('throws if the available balance is too low', async () => {
    routeTest.chain.synced = true

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(0),
      pending: BigInt(11),
      available: BigInt(0),
      availableNoteCount: 0,
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    await expect(routeTest.client.wallet.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: RPC_ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(21),
      confirmed: BigInt(0),
      pending: BigInt(21),
      available: BigInt(0),
      availableNoteCount: 0,
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    await expect(routeTest.client.wallet.sendTransaction(TEST_PARAMS_MULTI)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: RPC_ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('throws if send throws NotEnoughFundsError', async () => {
    routeTest.chain.synced = true

    await useAccountFixture(routeTest.node.wallet, 'account-throw-error')

    jest
      .spyOn(routeTest.node.wallet, 'send')
      .mockRejectedValue(new NotEnoughFundsError(Asset.nativeId(), BigInt(0), BigInt(1)))
    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(11),
      pending: BigInt(11),
      available: BigInt(11),
      availableNoteCount: 1,
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    await expect(routeTest.client.wallet.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        status: 400,
        code: RPC_ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('calls the send method on the node with single recipient', async () => {
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.wallet, 'account')
    const tx = await useMinersTxFixture(routeTest.node, account)

    jest.spyOn(routeTest.node.wallet, 'send').mockResolvedValue(tx)
    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(11),
      pending: BigInt(11),
      available: BigInt(11),
      availableNoteCount: 1,
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    const result = await routeTest.client.wallet.sendTransaction(TEST_PARAMS)
    expect(result.content.hash).toEqual(tx.hash().toString('hex'))
  })

  it('calls the send method on the node with multiple recipient', async () => {
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.wallet, 'account_multi-output')
    const tx = await useMinersTxFixture(routeTest.node, account)

    jest.spyOn(routeTest.node.wallet, 'send').mockResolvedValue(tx)
    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(21),
      confirmed: BigInt(21),
      pending: BigInt(21),
      available: BigInt(21),
      availableNoteCount: 1,
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    const result = await routeTest.client.wallet.sendTransaction(TEST_PARAMS_MULTI)
    expect(result.content.hash).toEqual(tx.hash().toString('hex'))
  })

  it('lets you configure the expiration and confirmations', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'expiration')
    const tx = await useMinersTxFixture(routeTest.node, account)

    routeTest.chain.synced = true

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValue({
      unconfirmed: BigInt(100000),
      pending: BigInt(100000),
      confirmed: BigInt(100000),
      available: BigInt(100000),
      availableNoteCount: 1,
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    const sendSpy = jest.spyOn(routeTest.node.wallet, 'send').mockResolvedValue(tx)

    await routeTest.client.wallet.sendTransaction(TEST_PARAMS)

    Assert.isNotUndefined(sendSpy.mock.lastCall)

    expect(sendSpy.mock.lastCall[0].expirationDelta).toBeUndefined()

    await routeTest.client.wallet.sendTransaction({
      ...TEST_PARAMS,
      expiration: 1234,
      expirationDelta: 12345,
      confirmations: 10,
    })

    expect(sendSpy.mock.lastCall[0]).toMatchObject({
      expiration: 1234,
      expirationDelta: 12345,
      confirmations: 10,
    })
  })

  it('allows you to pass in a hex encoded buffer', async () => {
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.wallet, 'memo')
    const tx = await useMinersTxFixture(routeTest.node, account)
    const sendSpy = jest.spyOn(routeTest.node.wallet, 'send').mockResolvedValue(tx)

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(11),
      pending: BigInt(11),
      available: BigInt(11),
      availableNoteCount: 1,
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    const memo = Buffer.from('deadbeef', 'hex')

    const params = {
      ...TEST_PARAMS,
      outputs: [
        {
          ...TEST_PARAMS.outputs[0],
          memo: undefined,
          memoHex: memo.toString('hex'),
        },
      ],
    }

    await routeTest.client.wallet.sendTransaction(params)
    expect(sendSpy).toHaveBeenCalled()

    const sendMemo = sendSpy.mock.lastCall?.[0].outputs[0].memo
    expect(sendMemo?.byteLength).toBe(memo.byteLength)
    expect(sendMemo?.equals(memo)).toBe(true)
  })

  it('should allow only one of memo or memoHex to be set', async () => {
    await expect(async () =>
      routeTest.client.wallet.sendTransaction({
        account: 'existingAccount',
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: BigInt(10).toString(),
            memo: 'abcd',
            memoHex: 'abcd',
            assetId: Asset.nativeId().toString('hex'),
          },
        ],
        fee: undefined,
      }),
    ).rejects.toThrow(RpcRequestError)
  })
})
