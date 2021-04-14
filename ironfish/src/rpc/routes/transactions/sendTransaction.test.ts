/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import { createRouteTest } from '../../../testUtilities/routeTest'
import { RangeHasher } from '../../../merkletree'
import { blockHash, makeFakeBlock, TestStrategy } from '../../../captain/testUtilities'
import { ResponseError } from '../../adapters'

describe('Transactions sendTransaction', () => {
  const routeTest = createRouteTest()
  const strategy = new TestStrategy(new RangeHasher())
  const heaviestHeader = makeFakeBlock(strategy, blockHash(2), blockHash(3), 1, 1, 1).header

  const paymentsParams = {
    amount: 10,
    fromAccountName: 'existingAccount',
    memo: '',
    toPublicKey: 'test2',
    transactionFee: BigInt(1).toString(),
  }

  beforeAll(async () => {
    await routeTest.node.accounts.createAccount('existingAccount', true)

    routeTest.node.captain.chain.getHeaviestHead = jest.fn().mockReturnValue(heaviestHeader)
  })

  it('throws if account does not exist', async () => {
    try {
      await routeTest.adapter.request('transaction/sendTransaction', {
        ...paymentsParams,
        fromAccountName: 'AccountDoesNotExist',
      })
    } catch (e: unknown) {
      if (!(e instanceof ResponseError)) throw e
      expect(e.message).toContain('No account found with name AccountDoesNotExist')
    }
  })

  it('throws if not connected to network', async () => {
    try {
      await routeTest.adapter.request('transaction/sendTransaction', paymentsParams)
    } catch (e: unknown) {
      if (!(e instanceof ResponseError)) throw e
      expect(e.message).toContain(
        'Your node must be connected to the Iron Fish network to send a transaction',
      )
    }
  })

  describe('Connected to the network', () => {
    it('throws if the chain is outdated', async () => {
      routeTest.node.peerNetwork['_isReady'] = true

      try {
        await routeTest.adapter.request('transaction/sendTransaction', paymentsParams)
      } catch (e: unknown) {
        if (!(e instanceof ResponseError)) throw e
        expect(e.message).toContain(
          'Your node must be synced with the Iron Fish network to send a transaction. Please try again later',
        )
      }
    })

    it('throws if not enough funds', async () => {
      routeTest.node.peerNetwork['_isReady'] = true
      heaviestHeader.timestamp = new Date()

      try {
        await routeTest.adapter.request('transaction/sendTransaction', paymentsParams)
      } catch (e: unknown) {
        if (!(e instanceof ResponseError)) throw e
        expect(e.message).toContain('Your balance is too low. Add funds to your account first')
      }
    })

    it('throws if the confirmed balance is too low', async () => {
      routeTest.node.peerNetwork['_isReady'] = true
      heaviestHeader.timestamp = new Date()
      jest.spyOn(routeTest.node.accounts, 'getBalance').mockReturnValueOnce({
        unconfirmedBalance: BigInt(11),
        confirmedBalance: BigInt(0),
      })

      try {
        await routeTest.adapter.request('transaction/sendTransaction', paymentsParams)
      } catch (e: unknown) {
        if (!(e instanceof ResponseError)) throw e
        expect(e.message).toContain(
          'Please wait a few seconds for your balance to update and try again',
        )
      }
    })

    it('calls the pay method on the node', async () => {
      routeTest.node.peerNetwork['_isReady'] = true
      heaviestHeader.timestamp = new Date()
      routeTest.node.accounts.pay = jest.fn()
      const paySpy = jest.spyOn(routeTest.node.accounts, 'pay')

      jest.spyOn(routeTest.node.accounts, 'getBalance').mockReturnValueOnce({
        unconfirmedBalance: BigInt(11),
        confirmedBalance: BigInt(11),
      })

      try {
        await routeTest.adapter.request('transaction/sendTransaction', paymentsParams)
      } catch {
        // payment is mocked
      }

      expect(paySpy).toHaveBeenCalled()
    })
  })
})
