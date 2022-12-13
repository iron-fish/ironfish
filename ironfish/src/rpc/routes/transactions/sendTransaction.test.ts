/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useAccountFixture, useMinersTxFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { ERROR_CODES } from '../../adapters'

const TEST_PARAMS = {
  fromAccountName: 'existingAccount',
  receives: [
    {
      publicAddress: 'test2',
      amount: BigInt(10).toString(),
      memo: '',
    },
  ],
  fee: BigInt(1).toString(),
}

const TEST_PARAMS_MULTI = {
  fromAccountName: 'existingAccount',
  receives: [
    {
      publicAddress: 'test2',
      amount: BigInt(10).toString(),
      memo: '',
    },
    {
      publicAddress: 'test3',
      amount: BigInt(10).toString(),
      memo: '',
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
        fromAccountName: 'AccountDoesNotExist',
      }),
    ).rejects.toThrow('No account found with name AccountDoesNotExist')
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
          'Your balance is too low. Add funds to your account first',
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )

    await expect(routeTest.client.sendTransaction(TEST_PARAMS_MULTI)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          'Your balance is too low. Add funds to your account first',
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
      pending: BigInt(0),
      pendingCount: 0,
      unconfirmedCount: 0,
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          'Your balance is too low. Add funds to your account first',
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(21),
      confirmed: BigInt(0),
      pending: BigInt(0),
      pendingCount: 0,
      unconfirmedCount: 0,
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS_MULTI)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          'Your balance is too low. Add funds to your account first',
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('throws if pay throws NotEnoughFundsError', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    await useAccountFixture(routeTest.node.wallet, 'account-throw-error')

    jest.spyOn(routeTest.node.wallet, 'pay').mockRejectedValue(new NotEnoughFundsError())
    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(11),
      pending: BigInt(0),
      pendingCount: 0,
      unconfirmedCount: 0,
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Your balance changed while creating a transaction.'),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('calls the pay method on the node with single recipient', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.wallet, 'account')
    const tx = await useMinersTxFixture(routeTest.node.wallet, account)

    jest.spyOn(routeTest.node.wallet, 'pay').mockResolvedValue(tx)
    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(11),
      pending: BigInt(0),
      pendingCount: 0,
      unconfirmedCount: 0,
    })

    const result = await routeTest.client.sendTransaction(TEST_PARAMS)
    expect(result.content.hash).toEqual(tx.hash().toString('hex'))
  })

  it('calls the pay method on the node with multiple recipient', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.wallet, 'account_multi-output')
    const tx = await useMinersTxFixture(routeTest.node.wallet, account)

    jest.spyOn(routeTest.node.wallet, 'pay').mockResolvedValue(tx)
    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(21),
      confirmed: BigInt(21),
      pending: BigInt(0),
      pendingCount: 0,
      unconfirmedCount: 0,
    })

    const result = await routeTest.client.sendTransaction(TEST_PARAMS_MULTI)
    expect(result.content.hash).toEqual(tx.hash().toString('hex'))
  })

  it('lets you configure the expiration', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'expiration')
    const tx = await useMinersTxFixture(routeTest.node.wallet, account)

    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    jest.spyOn(routeTest.node.wallet, 'getBalance').mockResolvedValue({
      unconfirmed: BigInt(100000),
      confirmed: BigInt(100000),
      pending: BigInt(0),
      pendingCount: 0,
      unconfirmedCount: 0,
    })

    const paySpy = jest.spyOn(routeTest.node.wallet, 'pay').mockResolvedValue(tx)

    await routeTest.client.sendTransaction(TEST_PARAMS)

    expect(paySpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      routeTest.node.config.get('defaultTransactionExpirationSequenceDelta'),
      undefined,
    )

    await routeTest.client.sendTransaction({
      ...TEST_PARAMS,
      expirationSequence: 1234,
      expirationSequenceDelta: 12345,
    })

    expect(paySpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      12345,
      1234,
    )
  })
})
