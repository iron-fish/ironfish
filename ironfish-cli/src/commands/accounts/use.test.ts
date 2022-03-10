/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as ironfish from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:use', () => {
  const useAccount = jest.fn<ironfish.UseAccountResponse, [ironfish.UseAccountRequest]>()
  const name = 'default'

  beforeEach(() => {
    const client = {
      useAccount,
      connect: jest.fn(),
    }

    ironfish.IronfishSdk.init = jest.fn().mockImplementationOnce(() => ({
      client: client,
      connectRpc: jest.fn().mockResolvedValue(client),
    }))
  })

  describe('providing the name of an account to use', () => {
    test
      .stdout()
      .command(['accounts:use', name])
      .exit(0)
      .it('calls `useAccount` and logs out a success message', (ctx) => {
        expect(useAccount).toHaveBeenCalledTimes(1)
        expect(useAccount.mock.calls[0][0].name).toBe(name)
        expectCli(ctx.stdout).include(`The default account is now: ${name}`)
      })
  })
})
