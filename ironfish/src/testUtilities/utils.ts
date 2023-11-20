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
  const outputs: { publicAddress: string; amount: bigint; memo: string; assetId: Buffer }[] = []
  for (let i = 0; i < numOutputs; i++) {
    outputs.push({
      publicAddress: account.publicAddress,
      amount: BigInt(1),
      memo: '',
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

/**
 * Asserts the type of a given function as a Jest mock.
 */
export function typeMock<T extends readonly unknown[], R>(
  func: (...args: [...T]) => R,
): jest.Mock<R, [...T]> {
  return func as jest.Mock<R, [...T]>
}

/**
 * Used to shuffle the responses from an asynchronous API call using a debounce strategy.
 * @param mock The mock to intercept calls for and shuffle
 * @param mocked The mock function to replace mock with
 * @param time The maximum amount of debounce time to allow before returning shuffled results
 */
export function mockImplementationShuffle<TArgs extends unknown[], TResult>(
  mock: jest.Mock<Promise<TResult>, TArgs>,
  mocked: (...args: TArgs) => Promise<TResult>,
  time = 10,
): () => void {
  type PromiseResolve = (result: Promise<TResult>) => void
  const buffer: [TArgs, PromiseResolve][] = []
  let lastTimeout: number | null = null
  let lastSend: number | null = null

  mock.mockImplementation((...args: TArgs): Promise<TResult> => {
    const promise = new Promise<Promise<TResult>>((resolve) => {
      if (lastTimeout) {
        clearTimeout(lastTimeout)
      }

      buffer.push([args, resolve])

      function send() {
        lastSend = Date.now()

        const shuffled = buffer.slice().sort(() => Math.random() - 0.5)
        buffer.length = 0

        for (const [args, resolve] of shuffled) {
          resolve(mocked(...args))
        }
      }

      // Force a send if the maximum amount of time has elapsed
      if (lastSend !== null && Date.now() - lastSend > time) {
        send()
        return
      }

      // Start the debounce timer
      lastTimeout = setTimeout(send, time) as unknown as number
    })

    return promise.then((r) => r)
  })

  return () => {
    if (lastTimeout) {
      clearTimeout(lastTimeout)
    }
  }
}
