/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as ironfishmodule from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:create command', () => {
  let createAccount = jest.fn()
  const use = jest.fn()

  const ironFishSdkBackup = ironfishmodule.IronfishSdk.init

  beforeEach(() => {
    createAccount = jest.fn().mockReturnValue({ content: {} })

    const client = {
      connect: jest.fn(),
      createAccount,
    }

    ironfishmodule.IronfishSdk.init = jest.fn().mockImplementation(() => ({
      accounts: {
        use,
        storage: { configPath: '' },
      },
      client: client,
      connectRpc: jest.fn().mockResolvedValue(client),
    }))
  })

  afterEach(() => {
    use.mockReset()
    ironfishmodule.IronfishSdk.init = ironFishSdkBackup
  })

  const name = 'testaccount'

  test
    .stdout()
    .command(['accounts:create', name])
    .exit(0)
    .it('creates the account', (ctx) => {
      expect(createAccount).toHaveBeenCalledWith({ name })
      expectCli(ctx.stdout).not.include(`The default account is now: ${name}`)
      expect(use).toBeCalledTimes(0)
    })

  test
    .stub(CliUx.ux, 'prompt', () => async () => await Promise.resolve(name))
    .stdout()
    .command(['accounts:create'])
    .exit(0)
    .it('asks for account name and creates it', (ctx) => {
      expectCli(ctx.stdout).include(`Creating account ${name}`)
      expect(createAccount).toHaveBeenCalledWith({ name })
    })
})
