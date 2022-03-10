/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as ironfish from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:remove', () => {
  let removeAccount: jest.Mock<
    ironfish.RemoveAccountResponse,
    [params: ironfish.RemoveAccountRequest]
  >
  const name = 'default'

  beforeEach(() => {
    removeAccount = jest.fn().mockImplementationOnce(() => ({
      content: { needsConfirm: true },
    }))

    ironfish.IronfishSdk.init = jest.fn().mockImplementationOnce(() => {
      const client = {
        removeAccount,
      }

      return {
        client: client,
        connectRpc: jest.fn().mockResolvedValue(client),
      }
    })
  })

  describe('with no flags', () => {
    test
      .stub(CliUx.ux, 'prompt', () => async () => await Promise.resolve(name))
      .stdout()
      .command(['accounts:remove', name])
      .exit(0)
      .it('calls `removeAccount` twice and successfully removes the account', (ctx) => {
        expect(removeAccount).toHaveBeenCalledTimes(2)
        expect(removeAccount.mock.calls[0][0]).toMatchObject({ name })
        expect(removeAccount.mock.calls[1][0]).toMatchObject({ name, confirm: true })
        expectCli(ctx.stdout).include(`Account '${name}' successfully removed.`)
      })
  })

  describe('with the incorrect name during confirmation', () => {
    const incorrectName = 'foobar'

    test
      .stub(CliUx.ux, 'prompt', () => async () => await Promise.resolve(incorrectName))
      .stdout()
      .command(['accounts:remove', name])
      .exit(1)
      .it('calls `removeAccount` once and logs an error', (ctx) => {
        expect(removeAccount).toHaveBeenCalledTimes(1)
        expect(removeAccount.mock.calls[0][0]).toMatchObject({ name })
        expectCli(ctx.stdout).include(`Aborting: ${incorrectName} did not match ${name}`)
      })
  })

  describe('with the confirmation flag', () => {
    beforeEach(() => {
      removeAccount = jest.fn().mockImplementation(() => ({
        content: {},
      }))
    })

    test
      .stdout()
      .command(['accounts:remove', '--confirm', name])
      .exit(0)
      .it('successfully removes account', (ctx) => {
        expect(removeAccount).toHaveBeenCalledTimes(1)
        expect(removeAccount.mock.calls[0][0]).toMatchObject({ name, confirm: true })
        expectCli(ctx.stdout).include(`Account '${name}' successfully removed.`)
      })
  })
})
