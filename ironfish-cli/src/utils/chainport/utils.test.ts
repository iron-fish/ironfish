/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Mock } from 'jest-mock'
import { RpcWalletNote, RpcWalletTransaction, TransactionType } from '@ironfish/sdk'
import { getConfig } from './config'
import { ChainportMemoMetadata } from './metadata'
import { extractChainportDataFromTransaction } from './utils'

jest.mock('./config')
jest.mock('./metadata')

describe('isChainportTransaction', () => {
  const mockConfig = {
    incomingAddresses: new Set(['incoming1', 'incoming2']),
    outgoingAddresses: new Set(['outgoing1', 'outgoing2']),
  }

  beforeEach(() => {
    ;(getConfig as Mock).mockReturnValue(mockConfig)
  })

  it('should return false for non-SEND/RECEIVE transactions', () => {
    const transaction = { type: TransactionType.MINER } as RpcWalletTransaction
    const result = extractChainportDataFromTransaction(1, transaction)
    expect(result).not.toBeDefined()
  })

  describe('incoming bridge transactions', () => {
    it('should return false if no notes are present', () => {
      const transaction = { type: TransactionType.RECEIVE } as RpcWalletTransaction
      const result = extractChainportDataFromTransaction(1, transaction)
      expect(result).not.toBeDefined()
    })

    it('should return false if sender is not in incoming addresses', () => {
      const transaction = {
        type: TransactionType.RECEIVE,
        notes: [{ sender: 'unknown', memoHex: '' }],
      } as RpcWalletTransaction
      const result = extractChainportDataFromTransaction(1, transaction)
      expect(result).not.toBeDefined()
    })

    it('should return true for valid incoming chainport transaction', () => {
      ;(ChainportMemoMetadata.decode as Mock).mockReturnValue([1, 'address'])

      const transaction = {
        type: TransactionType.RECEIVE,
        notes: [{ sender: 'incoming1', memoHex: 'mockHex' }] as RpcWalletNote[],
      } as RpcWalletTransaction
      const result = extractChainportDataFromTransaction(1, transaction)
      expect(result).toEqual({
        type: TransactionType.RECEIVE,
        chainportNetworkId: 1,
        address: 'address',
      })
    })
  })

  describe('outgoing transactions', () => {
    it('should return false if less than 2 notes are present', () => {
      const transaction = {
        type: TransactionType.SEND,
        notes: [{ owner: 'outgoing1', memoHex: '' }],
      } as RpcWalletTransaction
      const result = extractChainportDataFromTransaction(1, transaction)
      expect(result).not.toBeDefined()
    })

    it('should return false if fee payment memo is not present', () => {
      const transaction = {
        type: TransactionType.SEND,
        notes: [
          { owner: 'outgoing1', memo: '', memoHex: '' },
          { owner: 'outgoing1', memo: '', memoHex: '' },
        ],
      } as RpcWalletTransaction
      const result = extractChainportDataFromTransaction(1, transaction)
      expect(result).not.toBeDefined()
    })

    it('should return false if owner is not in outgoing addresses', () => {
      const transaction = {
        type: TransactionType.SEND,
        notes: [
          { owner: 'unknown', memo: '{"type": "fee_payment"}', memoHex: '' },
          { owner: 'unknown', memo: '', memoHex: '' },
        ],
      } as RpcWalletTransaction
      const result = extractChainportDataFromTransaction(1, transaction)
      expect(result).not.toBeDefined()
    })

    it('should return true for valid outgoing chainport transaction', () => {
      ;(ChainportMemoMetadata.decode as Mock).mockReturnValue([1, 'address'])
      const transaction = {
        type: TransactionType.SEND,
        notes: [
          { owner: 'outgoing1', memo: '{"type": "fee_payment"}', memoHex: 'mockHex' },
          { owner: 'outgoing1', memo: '', memoHex: 'mockHex' },
        ],
      } as RpcWalletTransaction
      const result = extractChainportDataFromTransaction(1, transaction)
      expect(result).toBeDefined()
      expect(result).toEqual({
        type: TransactionType.SEND,
        chainportNetworkId: 1,
        address: 'address',
      })
    })
  })
})
