/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GetBlockInfoResponse } from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('blocks:show', () => {
  const responseContent: GetBlockInfoResponse = {
    block: {
      graffiti: 'testGraffiti',
      difficulty: '21584575798742',
      hash: 'testHash',
      previousBlockHash: 'testPreviousBlockHash',
      sequence: 9,
      timestamp: 1652890982781,
      transactions: [
        {
          fee: '3',
          hash: 'transactionHash1',
          signature: 'transactionSignature1',
          notes: 2,
          spends: 1,
        },
        {
          fee: '2',
          hash: 'transactionHash2',
          signature: 'transactionSignature2',
          notes: 3,
          spends: 2,
        },
      ],
    },
    metadata: {
      main: true,
    },
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')
      const client = {
        connect: jest.fn(),
        getBlockInfo: jest.fn().mockReturnValue({ content: responseContent }),
      }
      const module: typeof jest = {
        ...originalModule,
        IronfishSdk: {
          init: jest.fn().mockReturnValue({
            connectRpc: jest.fn().mockResolvedValue(client),
            client,
          }),
        },
      }
      return module
    })
  })

  afterAll(() => {
    jest.dontMock('@ironfish/sdk')
  })

  describe('fetching block content by hash', () => {
    test
      .stdout()
      .command(['blocks:show', 'testHash'])
      .exit(0)
      .it('logs block content in json format', (ctx) => {
        expectCli(ctx.stdout).include(JSON.stringify(responseContent, undefined, '  '))
      })
  })
})
