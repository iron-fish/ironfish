/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { useAccountFixture, useMinersTxFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { ERROR_CODES } from '../../adapters'

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

describe('Transactions sendTransaction', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.wallet.createAccount('existingAccount', true)
  })

  it('throws if account does not exist', async () => {
    await expect(
      routeTest.client.sendTransaction({
        ...TEST_PARAMS,
        account: 'AccountDoesNotExist',
      }),
    ).rejects.toThrow('No account with name AccountDoesNotExist')
  })

  it('throws if not connected to network', async () => {
    routeTest.node.peerNetwork['_isReady'] = false

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      'Your node must be connected to the Iron Fish network to send a transaction',
    )
  })

  it('throws if the chain is outdated', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = false

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      'Your node must be synced with the Iron Fish network to send a transaction. Please try again later',
    )
  })

  it('throws if not enough funds', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )

    await expect(routeTest.client.sendTransaction(TEST_PARAMS_MULTI)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('throws if the confirmed balance is too low', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(0),
      pending: BigInt(11),
      available: BigInt(0),
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(21),
      confirmed: BigInt(0),
      pending: BigInt(21),
      available: BigInt(0),
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS_MULTI)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('throws if send throws NotEnoughFundsError', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
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
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('calls the send method on the node with single recipient', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.wallet, 'account')
    const tx = await useMinersTxFixture(routeTest.node.wallet, account)

    jest.spyOn(routeTest.node.wallet, 'send').mockResolvedValue(tx)
    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(11),
      pending: BigInt(11),
      available: BigInt(11),
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    const result = await routeTest.client.sendTransaction(TEST_PARAMS)
    expect(result.content.hash).toEqual(tx.hash().toString('hex'))
  })

  it('calls the send method on the node with multiple recipient', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.wallet, 'account_multi-output')
    const tx = await useMinersTxFixture(routeTest.node.wallet, account)

    jest.spyOn(routeTest.node.wallet, 'send').mockResolvedValue(tx)
    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(21),
      confirmed: BigInt(21),
      pending: BigInt(21),
      available: BigInt(21),
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    const result = await routeTest.client.sendTransaction(TEST_PARAMS_MULTI)
    expect(result.content.hash).toEqual(tx.hash().toString('hex'))
  })

  it('lets you configure the expiration and confirmations', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'expiration')
    const tx = await useMinersTxFixture(routeTest.node.wallet, account)

    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValue({
      unconfirmed: BigInt(100000),
      pending: BigInt(100000),
      confirmed: BigInt(100000),
      available: BigInt(100000),
      unconfirmedCount: 0,
      pendingCount: 0,
      blockHash: null,
      sequence: null,
    })

    const sendSpy = jest.spyOn(routeTest.node.wallet, 'send').mockResolvedValue(tx)

    await routeTest.client.sendTransaction(TEST_PARAMS)

    expect(sendSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      routeTest.node.config.get('transactionExpirationDelta'),
      undefined,
      undefined,
    )

    await routeTest.client.sendTransaction({
      ...TEST_PARAMS,
      expiration: 1234,
      expirationDelta: 12345,
      confirmations: 10,
    })

    expect(sendSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      12345,
      1234,
      10,
    )
  })
})
