/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios, { AxiosError } from 'axios'
import { createRouteTest } from '../../../testUtilities/routeTest'

jest.mock('axios')

describe('Route faucet.giveMe', () => {
  const routeTest = createRouteTest()

  it('should fail if the account does not exist in DB', async () => {
    await expect(
      routeTest.adapter.request('faucet/giveMe', { accountName: 'test-notfound' }),
    ).rejects.toThrow('Account test-notfound could not be found')
  }, 10000)

  describe('With a default account and the db', () => {
    let accountName = 'test' + Math.random().toString()
    const email = 'test@test.com'
    let publicAddress = ''

    beforeEach(async () => {
      accountName = 'test' + Math.random().toString()
      const account = await routeTest.node.accounts.createAccount(accountName, true)
      publicAddress = account.publicAddress
    })

    it('calls the API and returns the right response', async () => {
      const apiResponse = { message: 'success' }
      axios.post = jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve({ data: apiResponse }))
      const response = await routeTest.adapter.request('faucet/giveMe', { accountName, email })
      expect(response.status).toBe(200)

      expect(axios.post).toHaveBeenCalledWith(routeTest.node.config.get('getFundsApi'), null, {
        params: { email, publicKey: publicAddress },
      })
      expect(response.content).toMatchObject(apiResponse)
    }, 10000)

    it('throws an error if the API request fails', async () => {
      const apiResponse = new Error('API failure') as AxiosError
      axios.post = jest.fn().mockRejectedValueOnce(apiResponse)
      await expect(
        routeTest.adapter.request('faucet/giveMe', { accountName, email }),
      ).rejects.toThrow('API failure')
    }, 10000)
  })
})
