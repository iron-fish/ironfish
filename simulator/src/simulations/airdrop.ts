/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// This file should serve as an example simulation.
// It is a good idea to copy this file and use it as a template for your own simulations.

import { generateKey } from '@ironfish/rust-nodejs'
import { Assert, Logger } from '@ironfish/sdk'
import fs from 'fs/promises'
import { v4 as uuid } from 'uuid'
import { SECOND, Simulator, sleep } from '../simulator'
/**
 * Author: Joe Parks
 * Date: 2023-04-05
 * Description: Tests airdrop described in https://coda.io/d/_dMnayiE39lL/Airdrop_su_t8
 */

export async function run(
  logger: Logger,
  options?: {
    persist?: boolean
    duration?: number
  },
): Promise<void> {
  // Create a new simulation handler.
  // The simulator handles managing nodes and data dirs.
  const simulator = new Simulator(logger, options)

  const spendNode = await simulator.startNode({
    cfg: { transactionExpirationDelta: 10000, importGenesisAccount: true },
  })

  const viewNode = await simulator.startNode({
    cfg: { transactionExpirationDelta: 10000, importGenesisAccount: false },
  })

  // TODO: if these files don't exist the read on line ~113 fails with ENOENT
  const allocationsPath = '/tmp/allocations.txt'
  const splitTransactionPath = '/tmp/split_transaction.txt'
  const rawTransactionsPath = '/tmp/raw_transactions.txt'
  const postedTransactionsPath = '/tmp/posted_transactions.txt'
  const exportedAirdropPath = '/tmp/exported_airdrop.txt'
  const fakeAccounts = await fs.open(allocationsPath, 'w')

  // TODO: when fractions are generated, the amount in IRON cannot be less than 1, i.e. fraction cannot be less than
  // 1 / 4200000
  const fractions = splitOneIntoNFractions(20000)
  Assert.isEqual(
    fractions.reduce((sum, a) => sum + a, 0),
    1,
  )

  // TODO: it looks like the miner node (nodes[0]) never gets broadcasted the transaction from the viewnode
  // is this behaviour deterministic?
  // const minerNode = nodes[0]
  // setup accounts for test
  await spendNode.client.wallet.rescanAccountStream().waitForEnd()
  await spendNode.client.wallet.useAccount({ account: 'IronFishGenesisAccount' })
  const spendAccount = (await spendNode.client.wallet.exportAccount({ viewOnly: true })).content
    .account
  const viewAccount = spendAccount
  const viewAccountName = 'viewonly'

  await viewNode.client.wallet.importAccount({
    account: { ...viewAccount, name: viewAccountName },
  })
  await viewNode.client.wallet.useAccount({ account: viewAccountName })
  await viewNode.client.wallet.rescanAccountStream().waitForEnd()

  // setup test data
  for (const fraction of fractions) {
    const key = generateKey()
    const fakeGraffiti = uuid().slice(0, 15)
    await fakeAccounts.writeFile(
      `${key.publicAddress},${BigInt(Math.floor(42000000 * fraction))},${fakeGraffiti}\n`,
    )
  }
  logger.info(
    `[fake_accounts] created ${fractions.length} fake addresses,iron,graffiti entries at ${allocationsPath}`,
  )

  // BEGIN SIMULATION

  // Splits initial note into separate notes for airdrops
  logCliExecution(
    'airdrop:split',
    await viewNode.executeCliCommandAsync('airdrop:split', [
      `--account ${viewAccountName}`,
      `--allocations ${allocationsPath}`,
      `--output ${splitTransactionPath}`,
    ]),
    logger,
  )

  // post / add split transaction / wait for add split transaction to chain
  const splitRawTransaction = await fs.readFile(splitTransactionPath, 'utf8')
  const splitPostedTransaciton = await spendNode.client.wallet.postTransaction({
    transaction: splitRawTransaction,
  })
  const splitAddedTransaction = await viewNode.client.wallet.addTransaction({
    transaction: splitPostedTransaciton.content.transaction,
  })

  logger.info(`split transaction added ${splitTransactionPath}`)
  logger.info(JSON.stringify(splitAddedTransaction.content))

  logger.info('sleep for 5s')

  await sleep(5 * SECOND)
  // starting miner on spendnode for now because it actually has the transaction in the mempool
  // miner node is not getting it!!!
  spendNode.startMiner()

  logCliExecution(
    'wallet:transaction:watch',
    await viewNode.executeCliCommandAsync('wallet:transaction:watch', [
      splitAddedTransaction.content.hash,
    ]),
    logger,
  )

  logger.info('txn confirmed')

  spendNode.stopMiner()

  // Take all allocations from API db and create raw bundled transactions (600 notes/tx)
  logCliExecution(
    'airdrop:raw',
    await viewNode.executeCliCommandAsync('airdrop:raw', [
      `--account ${viewAccountName}`,
      `--allocations ${allocationsPath}`,
      `--raw ${rawTransactionsPath}`,
    ]),
    logger,
  )

  // post the raw transactions from the spend node
  logCliExecution(
    'airdrop:post',
    await spendNode.executeCliCommandAsync('airdrop:post', [
      `--account ${spendAccount.name}`,
      `--raw ${rawTransactionsPath}`,
      `--posted ${postedTransactionsPath}`,
    ]),
    logger,
  )
  spendNode.startMiner()

  // airdrop the coins, this will occur sequentially
  logCliExecution(
    'airdrop:airdrop',
    await viewNode.executeCliCommandAsync('airdrop:airdrop', [
      `--posted ${postedTransactionsPath}`,
    ]),
    logger,
  )

  spendNode.stopMiner()

  logCliExecution(
    'airdrop:export',
    await viewNode.executeCliCommandAsync('airdrop:export', [
      `--account ${viewAccountName}`,
      `--exported ${exportedAirdropPath}`,
    ]),
    logger,
  )

  // Call this to keep the simulation running. This currently will wait for all the nodes to exit.
  await simulator.waitForShutdown()
}

function splitOneIntoNFractions(n: number): number[] {
  // splits 1 into n fractions
  const decimals: number[] = []
  decimals[0] = Math.random() / n
  let sum = decimals[0]

  // Generate n-1 non-zero random decimals
  for (let i = 1; i < n - 1; i++) {
    decimals[i] = Math.random() / n
    sum += decimals[i]
  }

  // Set the last decimal to make sure the sum equals 1
  decimals[n - 1] = 1 - sum

  return decimals
}

function logCliExecution(
  fn: string,
  output: { stdout: string; stderr: string },
  logger: Logger,
): void {
  const { stdout, stderr } = output
  if (stdout && stdout.length > 0) {
    logger.log(`${fn} (stdout) ${stdout}`)
  }

  if (stderr && stderr.length > 0) {
    logger.log(`${fn} (stderr): ${stderr}`)
  }
}
