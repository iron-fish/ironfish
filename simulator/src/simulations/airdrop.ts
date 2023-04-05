/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// This file should serve as an example simulation.
// It is a good idea to copy this file and use it as a template for your own simulations.

import { generateKey } from '@ironfish/rust-nodejs'
import { Logger } from '@ironfish/sdk'
import { exec } from 'child_process'
import fs from 'fs/promises'
import { v4 as uuid } from 'uuid'
import {
  ErrorEvent,
  ExitEvent,
  IRON,
  LogEvent,
  SimulationNodeConfig,
  Simulator,
} from '../simulator'
/**
 * Author: Joe Parks
 * Date: 2023-04-05
 * Description: Tests airdrop described in https://coda.io/d/_dMnayiE39lL/Airdrop_su_t8
 */

export async function run(logger: Logger): Promise<void> {
  // Create a new simulation handler.
  // The simulator handles managing nodes and data dirs.
  const simulator = new Simulator(logger)

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
    nodes.push(await simulator.startNode())
  }
  const allocationsPath = '/tmp/allocations.txt'
  const splitTransactionPath = '/tmp/split_transaction.txt'
  const rawTransactionsPath = '/tmp/raw_transactions.txt'
  const postedTransactionsPath = '/tmp/posted_transactions.txt'
  const exportedAirdropPath = '/tmp/exported_airdrop.txt'
  const fakeAccounts = await fs.open(allocationsPath, 'w')
  const fractions = splitOneIntoNFractions(20000)
  const spendNode = nodes[1]
  const viewNode = nodes[2]
  const minerNode = nodes[0]
  // setup accounts for test
  await spendNode.executeCliCommandAsync('wallet:import', [
    'ironfishaccount0000010v38vetjwd5k7m3z8gcjcgnwv9kk2g36yfyhymmwge5hx6z8v4hx2umfwdqkxcm0w4h8gg3vyfehqetwv35kue6tv4ujyw3zxqmk2efhxgcrxv3exq6xydnz8q6nydfnvcungve3vvcryvp3xgekvveexdjrywphxgcnzde5x93rsvpcv3jxvvn9xcmrjepevejrqdez9s38v6t9wa9k27fz8g3rvde4xpnrvc3kx4jngc3kvejrxvtrvejn2vmrv4nrwdtyxpsk2cesxpjx2vpsxyervefjxsexxwtxvyukxwp3x5ukxvesxcmxgeryvguxzvpcvscryenyxsmnwvehvvcxxce4xcuxxd35xsuxzwphv4snvdekv93xvdfev5ckvvr9vgurqdn98psngcekv5uk2dpj8psn2c3eygkzy6twvdhk66twvatxjethfdjhjg36yfsn2c3jv93xxwfcv5mxzc3cxcunjd3nxqmrgdeexuckgdpjxsmrqepexc6nxctzx9skxdphvvcrzdtyvc6kgwfhxcurzefexgunjvp5ygkzymm4w3nk76twvatxjethfdjhjg36yfnrwwfn8q6nqwfkxuenyerrvcunvv3jxgmrgdtpxvergvrxxs6xzdtpv33rqdnzxf3rxcf4xvurjdnzv3jrswpcxqmnqc33vsexzdtyygkzyur4vfkxjc6pv3j8yetnwv3r5g3h8q6nwwty8yen2ce5xv6kxe3hv4nrydekx5er2e3kx5unwenrx56xgcnrv5mx2errvgcngepexu6x2ve5vymxzcek8ymkvwp4vcmrwg3vyf3hyetpw3jkgst5ygazyv3sxgej6vpn95cny4p38qarqwf6x5czudpc89dzylg5fr9yc',
  ])
  console.log('start scan')
  await spendNode.client.rescanAccountStream().waitForEnd()
  console.log('end scan')
  // logger.info('foooo', (await spendNode.client.getAccounts()).content.accounts.join(','))
  console.log('foooo', (await spendNode.client.getAccounts()).content.accounts.join(','))
  await spendNode.client.useAccount({ account: 'IronFishGenesisAccount' })
  console.log('use account done')
  const spendAccount = (await spendNode.client.exportAccount({ viewOnly: true })).content
    .account
  const viewAccount = spendAccount

  await viewNode.client.importAccount({ account: { ...viewAccount, name: 'viewonly' } })
  await viewNode.client.useAccount({ account: viewAccount.name })
  await viewNode.client.rescanAccountStream().waitForEnd()

  // setup test data
  for (const fraction of fractions) {
    const key = generateKey()
    const fakeGraffiti = uuid().slice(0, 15)
    await fakeAccounts.writeFile(
      `${key.publicAddress},${BigInt(Math.floor(420000 * fraction * IRON))},${fakeGraffiti}\n`,
    )
  }
  logger.info(
    `[fake_accounts] created ${fractions.length} fake addresses,ore,graffiti entries at ${allocationsPath}`,
  )

  minerNode.startMiner()

  // BEGIN SIMULATION
  // Splits initial note into separate notes for airdrops
  viewNode.executeCliCommand(
    'airdrop:split',
    [
      `--account ${spendAccount.name}`,
      `--allocations ${allocationsPath}`,
      `--output ${splitTransactionPath}`,
    ],
    {
      onError: (e) => logger.error(`fooooo ${e.message}`),
      onLog: (e) => logger.info(`fooooo ${e}`),
    },
  )

  // post / add split transaction / wait for add split transaction to chain
  const splitRawTransaction = await fs.readFile(splitTransactionPath, 'utf8')
  const splitPostedTransaciton = await spendNode.client.postTransaction({
    transaction: splitRawTransaction,
  })
  const splitAddedTransaction = await viewNode.client.addTransaction({
    transaction: splitPostedTransaciton.content.transaction,
  })
  viewNode.executeCliCommand('wallet:transaction:watch', [splitAddedTransaction.content.hash])

  // Take all allocations from API db and create raw bundled transactions (600 notes/tx)
  viewNode.executeCliCommand('airdrop:raw', [
    `--acount ${viewAccount.name}`,
    `--allocations ${allocationsPath}`,
    `--raw ${rawTransactionsPath}`,
  ])

  // post the raw transactions from the spend node
  spendNode.executeCliCommand(
    'airdrop:post',
    [
      `--acount ${spendAccount.name}`,
      `--raw ${rawTransactionsPath}`,
      `--posted ${postedTransactionsPath}`,
    ],
    {
      onError: (e) => logger.error(`fooooo ${e.message}`),
      onLog: (e) => logger.info(`fooooo ${e}`),
    },
  )

  // airdrop the coins, this will occur sequentially
  viewNode.executeCliCommand('airdrop:airdrop', [`--posted ${postedTransactionsPath}`])

  viewNode.executeCliCommand('airdrop:export', [`--exported ${exportedAirdropPath}`])

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
