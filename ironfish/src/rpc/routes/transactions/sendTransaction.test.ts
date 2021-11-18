/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useAccountFixture, useMinersTxFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RequestError } from '../../clients/errors'

const TEST_PARAMS = {
  amount: BigInt(10).toString(),
  fromAccountName: 'existingAccount',
  memo: '',
  toPublicKey: 'test2',
  fee: BigInt(1).toString(),
}

describe('Transactions sendTransaction', () => {
  const routeTest = createRouteTest()

  beforeAll(async () => {
    await routeTest.node.accounts.createAccount('existingAccount', true)
  })

  it('throws if account does not exist', async () => {
    try {
      await routeTest.client.sendTransaction({
        ...TEST_PARAMS,
        fromAccountName: 'AccountDoesNotExist',
      })
    } catch (e: unknown) {
      if (!(e instanceof RequestError)) {
        throw e
      }

      expect(e.message).toContain('No account found with name AccountDoesNotExist')
    }
  })

  it('throws if not connected to network', async () => {
    try {
      await routeTest.client.sendTransaction(TEST_PARAMS)
    } catch (e: unknown) {
      if (!(e instanceof RequestError)) {
        throw e
      }

      expect(e.message).toContain(
        'Your node must be connected to the Iron Fish network to send a transaction',
      )
    }
  })

  describe('Connected to the network', () => {
    it('throws if the chain is outdated', async () => {
      routeTest.node.peerNetwork['_isReady'] = true

      try {
        await routeTest.client.sendTransaction(TEST_PARAMS)
      } catch (e: unknown) {
        if (!(e instanceof RequestError)) {
          throw e
        }
        expect(e.message).toContain(
          'Your node must be synced with the Iron Fish network to send a transaction. Please try again later',
        )
      }
    })

    it('throws if not enough funds', async () => {
      routeTest.node.peerNetwork['_isReady'] = true
      routeTest.chain.synced = true

      try {
        await routeTest.client.sendTransaction(TEST_PARAMS)
      } catch (e: unknown) {
        if (!(e instanceof RequestError)) {
          throw e
        }
        expect(e.message).toContain('Your balance is too low. Add funds to your account first')
      }
    })

    it('throws if the confirmed balance is too low', async () => {
      routeTest.node.peerNetwork['_isReady'] = true
      routeTest.chain.synced = true

      jest.spyOn(routeTest.node.accounts, 'getBalance').mockReturnValueOnce({
        unconfirmed: BigInt(11),
        confirmed: BigInt(0),
      })

      try {
        await routeTest.client.sendTransaction(TEST_PARAMS)
      } catch (e: unknown) {
        if (!(e instanceof RequestError)) {
          throw e
        }

        expect(e.message).toContain(
          'Please wait a few seconds for your balance to update and try again',
        )
      }
    })

    it('calls the pay method on the node', async () => {
      routeTest.node.peerNetwork['_isReady'] = true
      routeTest.chain.synced = true
      routeTest.node.accounts.pay = jest.fn()

      const account = await useAccountFixture(routeTest.node.accounts, 'account')
      const tx = await useMinersTxFixture(routeTest.node.accounts, account)

      jest.spyOn(routeTest.node.accounts, 'pay').mockResolvedValue(tx)

      jest.spyOn(routeTest.node.accounts, 'getBalance').mockReturnValueOnce({
        unconfirmed: BigInt(11),
        confirmed: BigInt(11),
      })

      const result = await routeTest.client.sendTransaction(TEST_PARAMS)
      expect(result.content.hash).toEqual(tx.hash().toString('hex'))
    }, 30000)
  })
})
