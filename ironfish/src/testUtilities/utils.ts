/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

import { Asset } from '@ironfish/rust-nodejs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { Transaction } from '../primitives'
import { Account, Wallet } from '../wallet'
import { createRawTransaction } from './helpers/transaction'

export const TEST_DATA_DIR = path.join(process.cwd(), 'testdbs')

/**
 * This is only usable in the jasmine runner
 */
export function getCurrentTestPath(): string {
  return expect.getState().testPath || ''
}

export function getUniqueTestDataDir(): string {
  return path.join(TEST_DATA_DIR, uuid())
}

export function writeTestReport(
  csvReport: Map<string, string>,
  consoleReport: Map<string, string>,
  testName: string,
): void {
  if (process.env.GENERATE_TEST_REPORT) {
    let row = ''
    csvReport.forEach((v, k) => (row = row.concat(`${k}:${v},`)))
    console.log(row.substring(0, row.length - 1))
  } else {
    console.info(`[TEST RESULTS: ${testName}]`)
    consoleReport.forEach((v, k) => console.info(`${k}: ${v}`))
  }
}

export async function splitNotes(
  account: Account,
  numOutputs: number,
  wallet: Wallet,
): Promise<Transaction> {
  const outputs: { publicAddress: string; amount: bigint; memo: Buffer; assetId: Buffer }[] = []

  for (let i = 0; i < numOutputs; i++) {
    outputs.push({
      publicAddress: account.publicAddress,
      amount: BigInt(1),
      memo: Buffer.alloc(32),
      assetId: Asset.nativeId(),
    })
  }

  const transaction = await createRawTransaction({
    wallet: wallet,
    from: account,
    amount: BigInt(outputs.length),
    outputs,
  })

  Assert.isNotNull(account.spendingKey)
  return transaction.post(account.spendingKey)
}
