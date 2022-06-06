/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios, { AxiosError } from 'axios'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RequestError } from '../../clients'

jest.mock('axios')

describe('Route faucet.getFunds', () => {
  const routeTest = createRouteTest()

  describe('if the account does not exist in the DB', () => {
    it('should fail', async () => {
      await expect(
        routeTest.adapter.request('faucet/getFunds', { accountName: 'test-notfound' }),
      ).rejects.toThrow('Account test-notfound could not be found')
    }, 10000)
  })

  describe('With a default account and the db', () => {
    let accountName = 'test' + Math.random().toString()
    const email = 'test@test.com'
    let publicAddress = ''

    beforeEach(async () => {
      accountName = 'test' + Math.random().toString()
      const account = await routeTest.node.accounts.createAccount(accountName, true)
      publicAddress = account.publicAddress
    })

    describe('when the API request succeeds', () => {
      it('returns a 200 status code', async () => {
        routeTest.node.config.set('getFundsApi', 'foo.com')

        axios.post = jest
          .fn()
          .mockImplementationOnce(() => Promise.resolve({ data: { id: 5 } }))

        const response = await routeTest.adapter.request('faucet/getFunds', {
          accountName,
          email,
        })

        // Response gives back string for ID
        expect(response).toMatchObject({ status: 200, content: { id: '5' } })

        expect(axios.post).toHaveBeenCalledWith(
          'foo.com',
          {
            email,
            public_key: publicAddress,
          },
          expect.anything(),
        )
      }, 10000)
    })

    describe('when too many faucet requests have been made', () => {
      it('throws an error', async () => {
        axios.post = jest.fn().mockImplementationOnce(() => {
          throw {
            response: {
              data: {
                code: 'faucet_max_requests_reached',
                message: 'Too many faucet requests',
              },
            },
          }
        })
        await expect(
          routeTest.adapter.request('faucet/getFunds', { accountName, email }),
        ).rejects.toThrow(RequestError)
      })
    })

    describe('when the API request fails', () => {
      it('throws an error', async () => {
        const apiResponse = new Error('API failure') as AxiosError
        axios.post = jest.fn().mockRejectedValueOnce(apiResponse)
        await expect(
          routeTest.adapter.request('faucet/getFunds', { accountName, email }),
        ).rejects.toThrow('API failure')
      }, 10000)
    })
  })
})
