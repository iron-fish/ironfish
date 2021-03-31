/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { JobHelpers } from 'graphile-worker'

import { RPCClient } from '../rpc/rpc'
import { FAUCET_AMOUNT, FAUCET_ACCOUNT_NAME, FAUCET_FEE } from '../config'

const MEMO = 'Welcome to Iron Fish!'
const MAX_ATTEMPT = 3

interface FaucetPayload {
  publicKey: string
  email?: string
}
interface RPCError {
  codeMessage: string
}

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs))
}

function isFaucetPayload(payload: unknown): payload is FaucetPayload {
  return typeof payload === 'object' && payload !== null && 'publicKey' in payload
}

function isRPCError(error: unknown): error is RPCError {
  return typeof error === 'object' && error !== null && 'codeMessage' in error
}

export async function getFundsTask(payload: unknown, helpers: JobHelpers): Promise<void> {
  if (!isFaucetPayload(payload)) {
    return
  }

  const { publicKey } = payload

  helpers.logger.info(`Payment to ${publicKey} - processing`)

  const rpc = await RPCClient.init()
  const connected = await rpc.sdk.client.tryConnect()

  if (!connected) {
    throw new Error('Connection to RPC failed')
  }

  helpers.logger.info(`Connected to RPC`)

  // When a transaction is sent, it might take a few seconds for the node to be ready to spend
  // This will wait until the balance is > 0 again and then send the transaction
  // If after ~1 minute, the balance is still 0, fail the task
  let attempt = 0
  for (;;) {
    if (attempt > MAX_ATTEMPT) {
      throw new Error(`Not enough money on the faucet`)
    }

    const balance = await rpc.sdk.client.getAccountBalance()

    if (balance && Number(balance.content.confirmedBalance) > 0) {
      helpers.logger.info(`Faucet's balance is NOICE`)

      break
    }

    helpers.logger.info(`Faucet's balance is currently 0 - waiting on the balance to update`)
    await sleep(2000)
    attempt += 1
  }

  try {
    await rpc.sdk.client.sendTransaction({
      amount: FAUCET_AMOUNT.toString(),
      fromAccountName: FAUCET_ACCOUNT_NAME,
      memo: MEMO,
      toPublicKey: publicKey,
      transactionFee: BigInt(FAUCET_FEE).toString(),
    })
  } catch (error: unknown) {
    if (isRPCError(error)) {
      throw new Error(`Sending transaction failed ${error.codeMessage}`)
    }
    throw new Error(`Sending transaction failed`)
  }

  helpers.logger.info(`Payment to ${publicKey} - done`)
}
