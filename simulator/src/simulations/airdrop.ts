/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// This file should serve as an example simulation.
// It is a good idea to copy this file and use it as a template for your own simulations.

import { generateKey } from '@ironfish/rust-nodejs'
import { Assert, Logger } from '@ironfish/sdk'
import { exec } from 'child_process'
import fs from 'fs/promises'
import { v4 as uuid } from 'uuid'
import {
  ErrorEvent,
  ExitEvent,
  IRON,
  IRON_TO_ORE,
  LogEvent,
  SECOND,
  SimulationNodeConfig,
  Simulator,
  sleep,
} from '../simulator'
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

  const onLog = (event: LogEvent): void => {
    logger.log(`[${event.node}:${event.proc}:log:${event.type}] ${JSON.stringify(event)}`)
  }

  const onExit = (event: ExitEvent): void => {
    logger.log(`[${event.node}:exit] ${JSON.stringify(event)}`)
  }

  const onError = (event: ErrorEvent): void => {
    logger.log(`[${event.node}:error] ${JSON.stringify(event)}`)
  }

  const nodes = []
  for (let i = 0; i < 3; i++) {
    nodes.push(await simulator.startNode({ cfg: { transactionExpirationDelta: 10000 } }))
  }

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
  const spendNode = nodes[1]
  const viewNode = nodes[2]

  // TODO: it looks like the miner node (nodes[0]) never gets broadcasted the transaction from the viewnode
  // is this behaviour deterministic?
  const minerNode = nodes[0]
  // setup accounts for test
  await spendNode.executeCliCommandAsync('wallet:import', [
    'ironfishaccount0000010v38vetjwd5k7m3z8gcjcgnwv9kk2g36yfyhymmwge5hx6z8v4hx2umfwdqkxcm0w4h8gg3vyfehqetwv35kue6tv4ujyw3zxqmk2efhxgcrxv3exq6xydnz8q6nydfnvcungve3vvcryvp3xgekvveexdjrywphxgcnzde5x93rsvpcv3jxvvn9xcmrjepevejrqdez9s38v6t9wa9k27fz8g3rvde4xpnrvc3kx4jngc3kvejrxvtrvejn2vmrv4nrwdtyxpsk2cesxpjx2vpsxyervefjxsexxwtxvyukxwp3x5ukxvesxcmxgeryvguxzvpcvscryenyxsmnwvehvvcxxce4xcuxxd35xsuxzwphv4snvdekv93xvdfev5ckvvr9vgurqdn98psngcekv5uk2dpj8psn2c3eygkzy6twvdhk66twvatxjethfdjhjg36yfsn2c3jv93xxwfcv5mxzc3cxcunjd3nxqmrgdeexuckgdpjxsmrqepexc6nxctzx9skxdphvvcrzdtyvc6kgwfhxcurzefexgunjvp5ygkzymm4w3nk76twvatxjethfdjhjg36yfnrwwfn8q6nqwfkxuenyerrvcunvv3jxgmrgdtpxvergvrxxs6xzdtpv33rqdnzxf3rxcf4xvurjdnzv3jrswpcxqmnqc33vsexzdtyygkzyur4vfkxjc6pv3j8yetnwv3r5g3h8q6nwwty8yen2ce5xv6kxe3hv4nrydekx5er2e3kx5unwenrx56xgcnrv5mx2errvgcngepexu6x2ve5vymxzcek8ymkvwp4vcmrwg3vyf3hyetpw3jkgst5ygazyv3sxgej6vpn95cny4p38qarqwf6x5czudpc89dzylg5fr9yc',
  ])
  await spendNode.client.rescanAccountStream().waitForEnd()
  await spendNode.client.useAccount({ account: 'IronFishGenesisAccount' })
  const spendAccount = (await spendNode.client.exportAccount({ viewOnly: true })).content
    .account
  const viewAccount = spendAccount

  await viewNode.client.importAccount({ account: { ...viewAccount, name: viewAccount.name } })

  await viewNode.client.useAccount({ account: viewAccount.name })
  await viewNode.client.rescanAccountStream().waitForEnd()

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
  const { stdout, stderr } = await viewNode.executeCliCommandAsync('airdrop:split', [
    `--account ${spendAccount.name}`,
    `--allocations ${allocationsPath}`,
    `--output ${splitTransactionPath}`,
  ])
  if (stderr && stderr.length > 0) {
    logger.error(`airdrop:split (stderr) ${stderr}`)
  }

  if (stdout && stdout.length > 0) {
    logger.info(`airdrop:split (stdout): ${stdout}`)
  }

  // post / add split transaction / wait for add split transaction to chain
  const splitRawTransaction = await fs.readFile(splitTransactionPath, {
    encoding: 'utf8',
    flag: 'a+',
  })
  console.log('split transaction created at', splitTransactionPath)

  const splitPostedTransaciton = await spendNode.client.postTransaction({
    transaction: splitRawTransaction,
  })
  console.log('split transaction posted')

  const splitAddedTransaction = await viewNode.client.addTransaction({
    transaction: splitPostedTransaciton.content.transaction,
  })
  console.log('split transaction added', splitTransactionPath)
  console.log(splitAddedTransaction.content)

  console.log('sleep for 5s')

  await sleep(5 * SECOND)
  // starting miner on spendnode for now because it actually has the transaction in the mempool
  // miner node is not getting it!!!
  spendNode.startMiner()

  logCliExecution(
    'wallet:transaction:watch',
    await viewNode.executeCliCommandAsync('wallet:transaction:watch', [
      splitAddedTransaction.content.hash,
    ]),
  )

  console.log('txn confirmed')

  spendNode.stopMiner()

  // Take all allocations from API db and create raw bundled transactions (600 notes/tx)
  logCliExecution(
    'airdrop:raw',
    await viewNode.executeCliCommandAsync('airdrop:raw', [
      `--account ${viewAccount.name}`,
      `--allocations ${allocationsPath}`,
      `--raw ${rawTransactionsPath}`,
    ]),
  )

  // post the raw transactions from the spend node
  logCliExecution(
    'airdrop:post',
    await spendNode.executeCliCommandAsync('airdrop:post', [
      `--account ${spendAccount.name}`,
      `--raw ${rawTransactionsPath}`,
      `--posted ${postedTransactionsPath}`,
    ]),
  )

  // airdrop the coins, this will occur sequentially
  logCliExecution(
    'airdrop:airdrop',
    await viewNode.executeCliCommandAsync('airdrop:airdrop', [
      `--posted ${postedTransactionsPath}`,
    ]),
  )

  logCliExecution(
    'airdrop:export',
    await viewNode.executeCliCommandAsync('airdrop:export', [
      `--exported ${exportedAirdropPath}`,
    ]),
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

function logCliExecution(fn: string, output: { stdout: string; stderr: string }): void {
  const { stdout, stderr } = output
  if (stdout && stdout.length > 0) {
    console.log(`${fn} (stdout) ${stdout}`)
  }

  if (stderr && stderr.length > 0) {
    console.log(`${fn} (stderr): ${stderr}`)
  }
}
