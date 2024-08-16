/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { bigIntToBytes, bytesToBigInt } from '@ethereumjs/util'

export interface EvmDescription {
  nonce: bigint
  gasPrice: bigint
  gasLimit: bigint
  to: Buffer | undefined
  value: bigint
  data: Buffer
  privateIron: bigint
  publicIron: bigint
  v?: bigint
  r?: Buffer
  s?: Buffer
}

export function legacyTransactionToEvmDescription(tx: LegacyTransaction): EvmDescription {
  return {
    nonce: BigInt(tx.nonce),
    gasPrice: tx.gasPrice,
    gasLimit: tx.gasLimit,
    to: tx.to ? Buffer.from(tx.to.bytes) : undefined,
    value: BigInt(tx.value),
    data: Buffer.from(tx.data),
    v: tx.v,
    r: tx.r ? Buffer.from(bigIntToBytes(tx.r)) : undefined,
    s: tx.s ? Buffer.from(bigIntToBytes(tx.s)) : undefined,
    privateIron: BigInt(0),
    publicIron: BigInt(0),
  }
}

export function evmDescriptionToLegacyTransaction(desc: EvmDescription): LegacyTransaction {
  return new LegacyTransaction({
    nonce: desc.nonce,
    to: desc.to,
    value: desc.value,
    data: desc.data,
    v: desc.v,
    r: desc.r ? bytesToBigInt(desc.r) : undefined,
    s: desc.s ? bytesToBigInt(desc.s) : undefined,
    // TODO(jwp) gas constants are hardcoded
    gasLimit: desc.gasLimit,
    gasPrice: desc.gasPrice,
  })
}
