/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export type EthRpcTransaction = {
  blockHash: string
  blockNumber: string
  from: string
  gas: string
  gasPrice: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
  hash: string
  input: string
  nonce: string
  to: string | null
  transactionIndex: string
  value: string
  type: string
  accessList: string[]
  chainId: string
  v: string
  r: string
  s: string
  yParity: string
}

export const EthRpcTransactionSchema: yup.ObjectSchema<EthRpcTransaction> = yup
  .object({
    blockHash: yup.string().defined(),
    blockNumber: yup.string().defined(),
    from: yup.string().defined(),
    gas: yup.string().defined(),
    gasPrice: yup.string().defined(),
    maxFeePerGas: yup.string().defined(),
    maxPriorityFeePerGas: yup.string().defined(),
    hash: yup.string().defined(),
    input: yup.string().defined(),
    nonce: yup.string().defined(),
    to: yup.string().nullable().defined(),
    transactionIndex: yup.string().defined(),
    value: yup.string().defined(),
    type: yup.string().defined(),
    accessList: yup.array().of(yup.string().defined()).defined(),
    chainId: yup.string().defined(),
    v: yup.string().defined(),
    r: yup.string().defined(),
    s: yup.string().defined(),
    yParity: yup.string().defined(),
  })
  .defined()

export type EthRpcLog = {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  blockHash: string
  transactionHash: string
  transactionIndex: string
  logIndex: string
  removed: boolean
}

export const EthRpcLogSchema: yup.ObjectSchema<EthRpcLog> = yup
  .object({
    address: yup.string().defined(),
    topics: yup.array().of(yup.string().defined()).defined(),
    data: yup.string().defined(),
    blockNumber: yup.string().defined(),
    blockHash: yup.string().defined(),
    transactionHash: yup.string().defined(),
    transactionIndex: yup.string().defined(),
    logIndex: yup.string().defined(),
    removed: yup.bool().defined(),
  })
  .defined()
