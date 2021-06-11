/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:rescan', () => {
  const contentStream = jest.fn().mockImplementation(function* () {
    yield 0
  })
  const runRescan = jest.fn()

  beforeEach(() => {
    const originalModule = jest.requireActual('ironfish')
    jest.doMock(
      'ironfish',
      () =>
        ({
          ...originalModule,
          runRescan,
          IronfishSdk: {
            init: jest.fn().mockImplementation(() => ({
              client: {
                connect: jest.fn(),
                rescanAccountStream: jest.fn().mockImplementationOnce(() => ({
                  contentStream,
                })),
              },
              node: jest.fn().mockImplementationOnce(() => ({
                openDB: jest.fn(),
                chain: {
                  open: jest.fn(),
                },
              })),
            })),
          },
        } as typeof jest),
    )
  })

  afterEach(() => {
    jest.unmock('ironfish')
  })

  describe('with no flags', () => {
    test
      .stdout()
      .command(['accounts:rescan'])
      .exit(0)
      .it('fetches sequences from the client and scans successfully', (ctx) => {
        expect(contentStream).toHaveBeenCalled()
        expectCli(ctx.stdout).include('Scanning Complete')
      })
  })

  describe('with the offline flag', () => {
    test
      .stdout()
      .command(['accounts:rescan', '--offline'])
      .exit(0)
      .it('fetches sequences from the node and scans successfully', (ctx) => {
        expect(runRescan).toHaveBeenCalledTimes(1)
        expectCli(ctx.stdout).include('Scanning Complete')
      })
  })
})
