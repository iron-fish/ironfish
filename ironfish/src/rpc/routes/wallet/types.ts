/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type RpcAccountTransaction = {
  hash: string
  fee: string
  blockHash?: string
  blockSequence?: number
  notesCount: number
  spendsCount: number
  mintsCount: number
  burnsCount: number
  expiration: number
  timestamp: number
  submittedSequence: number
}

export type RcpAccountAssetBalanceDelta = {
  assetId: string
  assetName: string
  delta: string
}

export type RpcAccountDecryptedNote = {
  isOwner: boolean
  value: string
  assetId: string
  assetName: string
  memo: string
  sender: string
  owner: string
  spent: boolean
}
