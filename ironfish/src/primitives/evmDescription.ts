/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { bigIntToBytes, bytesToBigInt } from '@ethereumjs/util'

export interface UnsignedEvmDescription {
  nonce: bigint
  gasPrice: bigint
  gasLimit: bigint
  to: Buffer
  value: bigint
  data: Buffer
  privateIron: bigint
  publicIron: bigint
}

export interface EvmDescription extends UnsignedEvmDescription {
  v: number
  r: Buffer
  s: Buffer
}

export function legacyTransactionToEvmDescription(tx: LegacyTransaction): EvmDescription {
  return {
    nonce: BigInt(tx.nonce),
    gasPrice: tx.gasPrice,
    gasLimit: tx.gasLimit,
    to: tx.to ? Buffer.from(tx.to.bytes) : Buffer.alloc(0),
    value: BigInt(tx.value),
    data: Buffer.from(tx.data),
    v: Number(tx.v),
    r: tx.r ? Buffer.from(bigIntToBytes(tx.r)) : Buffer.alloc(0),
    s: tx.s ? Buffer.from(bigIntToBytes(tx.s)) : Buffer.alloc(0),
    privateIron: BigInt(0),
    publicIron: BigInt(0),
  }
}

export function evmDescriptionToLegacyTransaction(desc: EvmDescription): LegacyTransaction {
  return new LegacyTransaction({
    nonce: desc.nonce,
    to: desc.to.length > 0 ? desc.to : undefined,
    value: desc.value,
    data: desc.data,
    v: BigInt(desc.v),
    r: desc.r.length > 0 ? bytesToBigInt(desc.r) : undefined,
    s: desc.s.length > 0 ? bytesToBigInt(desc.s) : undefined,
    // TODO(jwp) gas constants are hardcoded
    gasLimit: desc.gasLimit,
    gasPrice: desc.gasPrice,
  })
}
