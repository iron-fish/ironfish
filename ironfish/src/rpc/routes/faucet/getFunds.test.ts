/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios, { AxiosError } from 'axios'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RpcRequestError } from '../../clients'

jest.mock('axios')

describe('Route faucet.getFunds', () => {
  const routeTest = createRouteTest()

  let accountName = 'test' + Math.random().toString()
  const email = 'test@test.com'
  let publicAddress = ''

  beforeEach(async () => {
    accountName = 'test' + Math.random().toString()
    const account = await routeTest.node.wallet.createAccount(accountName, { setDefault: true })
    publicAddress = account.publicAddress
    routeTest.node.internal.set('networkId', 0)
  })

  describe('when the API request succeeds', () => {
    it('returns a 200 status code', async () => {
      routeTest.node.config.set('getFundsApi', 'foo.com')

      axios.post = jest
        .fn<typeof axios.post>()
        .mockResolvedValueOnce({ data: { id: 5 } }) as typeof axios.post

      const response = await routeTest.client
        .request('faucet/getFunds', {
          accountName,
          email,
        })
        .waitForEnd()

      // Response gives back string for ID
      expect(response).toMatchObject({ status: 200, content: { id: '5' } })

      expect(axios.post).toHaveBeenCalledWith('foo.com', {
        email,
        public_key: publicAddress,
      })
    })
  })

  describe('when too many faucet requests have been made', () => {
    it('throws an error', async () => {
      axios.post = jest.fn<typeof axios.post>().mockImplementationOnce(() => {
        throw {
          response: {
            data: {
              code: 'faucet_max_requests_reached',
              message: 'Too many faucet requests',
            },
          },
        }
      }) as typeof axios.post
      await expect(
        routeTest.client.faucet.getFunds({ account: accountName, email }),
      ).rejects.toThrow(RpcRequestError)
    })
  })

  describe('when the API request fails', () => {
    it('throws an error', async () => {
      const apiResponse = new Error('API failure') as AxiosError
      axios.post = jest
        .fn<typeof axios.post>()
        .mockRejectedValueOnce(apiResponse) as typeof axios.post
      await expect(
        routeTest.client.faucet.getFunds({ account: accountName, email }),
      ).rejects.toThrow('API failure')
    })
  })

  describe('should fail when non testnet node', () => {
    it('throws an error', async () => {
      routeTest.node.internal.set('networkId', 2)
      await expect(
        routeTest.client.faucet.getFunds({ account: accountName, email }),
      ).rejects.toThrow('This endpoint is only available for testnet.')
    })
  })
})
