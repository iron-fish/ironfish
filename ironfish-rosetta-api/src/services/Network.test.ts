/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Request, Response } from 'express'

const NodeFileProvider = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const getPeers = jest.fn().mockReturnValue({
  content: { peers: [{ identity: '123' }, { identity: '12345' }] },
})
const getChainInfo = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
NodeFileProvider.prototype.init = jest.fn()
jest.mock('ironfish', () => ({
  NodeFileProvider,
  IronfishSdk: {
    init: jest.fn().mockImplementation(() => ({
      client: {
        connect: jest.fn(),
        getChainInfo,
        getPeers,
      },
    })),
  },
}))

import { networkIdentifier as networkIdentifierConfig } from '../config'
import { RequestHandlerParams } from '../middleware'
import { NetworkIdentifier, NetworkRequest } from '../types'
import { NetworkList, NetworkStatus } from './Network'

describe('Network service', () => {
  describe('NetworkList', () => {
    it('returns the right NetworkList', async () => {
      const networkList = await NetworkList()
      expect(networkList).toEqual({
        network_identifiers: [{ blockchain: 'Iron Fish', network: 'testnet' }],
      })
    })
  })

  describe('NetworkStatus service', () => {
    const request = jest.fn() as unknown as Request
    const response = jest.fn() as unknown as Response

    const getRequestHander = (
      networkIdentifier: NetworkIdentifier,
    ): RequestHandlerParams<NetworkRequest> => ({
      params: {
        network_identifier: networkIdentifier,
      },
      request,
      response,
    })

    it('fails without the right network identifier', async () => {
      await expect(NetworkStatus(getRequestHander({} as NetworkIdentifier))).rejects.toThrow(
        'Network identifier is not valid',
      )
    })

    it('throws an error without a response from the node', async () => {
      await expect(NetworkStatus(getRequestHander(networkIdentifierConfig))).rejects.toThrow(
        'Chain info data not found',
      )
    })

    describe('With a response from the node', () => {
      beforeAll(() => {
        getChainInfo.mockReturnValue({
          content: {
            currentBlockIdentifier: {
              index: '2',
              hash: 'abcd',
            },
            genesisBlockIdentifier: {
              index: '1',
              hash: 'abc',
            },
            oldestBlockIdentifier: {
              index: '3',
              hash: 'abcde',
            },
            currentBlockTimestamp: 1234,
          },
        })
      })

      it('returns the right response', async () => {
        const response = await NetworkStatus(getRequestHander(networkIdentifierConfig))
        expect(response).toEqual({
          current_block_identifier: {
            hash: 'abcd',
            index: 2,
          },
          current_block_timestamp: 1234,
          genesis_block_identifier: {
            hash: 'abc',
            index: 1,
          },
          oldest_block_identifier: {
            hash: 'abcde',
            index: 3,
          },
          peers: [
            {
              peer_id: '123',
            },
            {
              peer_id: '12345',
            },
          ],
        })
      })
    })
  })
})
