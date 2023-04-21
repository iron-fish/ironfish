/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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

export async function run(simulator: Simulator, logger: Logger): Promise<void> {
  // Create a new simulation handler.
  // The simulator handles managing nodes and data dirs.

  const spendNode = await simulator.startNode({
    cfg: {
      transactionExpirationDelta: 10000,
      importGenesisAccount: true,
      verbose: true,
    },
  })

  logger.log(`Spend node: ${spendNode.config.dataDir}`)

  const viewNode = await simulator.startNode({
    cfg: {
      transactionExpirationDelta: 10000,
      importGenesisAccount: false,
      verbose: true,
    },
  })

  logger.log(`View node: ${viewNode.config.dataDir}`)

  // TODO: if these files don't exist the read on line ~113 fails with ENOENT
  const allocationsPath = '/tmp/allocations.txt'
  const splitTransactionPath = '/tmp/split_transaction.txt'
  const rawTransactionsPath = '/tmp/raw_transactions.txt'
  const postedTransactionsPath = '/tmp/posted_transactions.txt'
  const exportedAirdropPath = '/tmp/exported_airdrop.txt'
  const fakeAccounts = await fs.open(allocationsPath, 'w')

  // TODO: when fractions are generated, the amount in IRON cannot be less than 1, so the fraction cannot be less than
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
  logger.info('[fake_accounts] creating...')
  for (const fraction of fractions) {
    const key = generateKey()
    const fakeGraffiti = uuid().slice(0, 15)
    await fakeAccounts.writeFile(
      `${key.publicAddress},${BigInt(Math.floor(42000000 * fraction))},${fakeGraffiti}\n`,
    )
  }

  await fakeAccounts.close()

  logger.info(
    `[fake_accounts] created ${fractions.length} fake addresses,iron,graffiti entries at ${allocationsPath}`,
  )

  // BEGIN SIMULATION

  // Splits initial note into separate notes for airdrops
  await viewNode.executeCliCommand(
    'airdrop:split',
    [
      `--account`,
      `${viewAccountName}`,
      `--allocations`,
      `${allocationsPath}`,
      `--output`,
      `${splitTransactionPath}`,
    ],
    {
      onLog: (msg) => logger.info(msg),
      onError: (err: Error) => logger.error(err.message),
    },
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

  // starting miner on spendnode for now because it actually has the transaction in the mempool
  // the miner node is not getting it
  spendNode.startMiner()

  await viewNode.executeCliCommand(
    'wallet:transaction:watch',
    [splitAddedTransaction.content.hash],
    {
      onLog: (stdout) => logger.info(stdout),
      onError: (err: Error) => logger.error(err.message),
    },
  )

  logger.info('txn confirmed')

  spendNode.stopMiner()

  // Take all allocations from API db and create raw bundled transactions (600 notes/tx)
  await viewNode.executeCliCommand(
    'airdrop:raw',
    [
      `--account`,
      `${viewAccountName}`,
      `--allocations`,
      `${allocationsPath}`,
      `--raw`,
      `${rawTransactionsPath}`,
    ],
    {
      onLog: (msg) => logger.info(msg),
      onError: (err: Error) => logger.error(err.message),
    },
  )

  // post the raw transactions from the spend node
  // This command takes upwards of 90mins to run
  await spendNode.executeCliCommand(
    'airdrop:post',
    [
      `--account`,
      `${spendAccount.name}`,
      `--raw`,
      `${rawTransactionsPath}`,
      `--posted`,
      `${postedTransactionsPath}`,
    ],
    {
      onLog: (msg) => logger.info(msg),
      onError: (err: Error) => logger.error(err.message),
    },
  )

  spendNode.startMiner()

  // This is necessary for `airdrop:airdrop` to work
  logger.log(`sleeping for 10s to mine some blocks before airdrop...`)
  await sleep(10 * SECOND)

  logger.log(`airdropping...`)

  // airdrop the coins, this will occur sequentially
  await viewNode.executeCliCommand(
    'airdrop:airdrop',
    [`--posted`, `${postedTransactionsPath}`],
    {
      onLog: (msg) => logger.info(msg),
      onError: (err: Error) => logger.error(err.message),
    },
  )

  spendNode.stopMiner()

  logger.log(`exporting...`)
  await viewNode.executeCliCommand(
    'airdrop:export',
    [`--account`, `${viewAccountName}`, `--exported`, `${exportedAirdropPath}`],
    {
      onLog: (msg) => logger.info(msg),
      onError: (err: Error) => logger.error(err.message),
    },
  )

  logger.log(`airdrop complete, exported to ${exportedAirdropPath}`)

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
