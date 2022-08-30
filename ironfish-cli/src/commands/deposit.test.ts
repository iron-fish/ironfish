/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishSdk } from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('deposit command', () => {
  const fee = 1
  const amount = 0.000001
  const to =
    '997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed'
  const from = 'test_account'
  const memo = 'test memo for a transaction'
  const hash =
    'aaaa586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed'
  const confirmationString = `$IRON 0.00001000 ($ORE 1,000) plus a transaction fee of $IRON 0.00000001 ($ORE 1) to ${to} from the account ${from}`

  const getAccountBalance = jest.fn().mockResolvedValue({ content: { confirmed: 10000001 } })
  IronfishSdk.init = jest.fn().mockImplementation(() => {
    const client = {
      connect: jest.fn(),
      getAccountBalance: getAccountBalance,
      sendTransaction: jest.fn().mockReturnValue({
        content: {
          receives: [
            {
              publicAddress: to,
              amount,
              memo,
            },
          ],
          fromAccountName: from,
          hash,
        },
      }),
      getFees: jest.fn().mockResolvedValue({ content: { p25: 10 } }),
    }

    return {
      client: client,
      connectRpc: jest.fn().mockResolvedValue(client),
    }
  })

  test
    .stdout()
    .command(['deposit', `-f ${from}`, `-o ${fee}`, '-c'])
    .exit(0)
    .it('does a basic deposit', (ctx) => {
      expectCli(ctx.stdout).include(
        `Sending $IRON 0.10000000 ($ORE 10,000,000) to ${to} from ${from}`,
      )
      expectCli(ctx.stdout).include(`Transaction Hash: ${hash}`)
      expectCli(ctx.stdout).include(`Transaction Fee: $IRON 0.00000001 ($ORE 1)`)
    })
})
