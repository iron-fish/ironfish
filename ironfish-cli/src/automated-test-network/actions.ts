/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, isValidPublicAddress } from '@ironfish/rust-nodejs'
import { RpcTcpClient } from '@ironfish/sdk'
import { TestNodeConfig } from './testnode'
import { second, sleep } from './utils'

export interface Action {
  config: ActionConfig
  nodes: TestNodeConfig[]
  start: () => void
  stop: () => void
}

export type ActionConfig = SendActionConfig | MintActionConfig

type SendActionConfig = {
  kind: 'send'
  name: string
  from: string
  to: string
  rate: number // per second
  spendLimit: number // limit in ORE
  spendType: 'flat' | 'random' // either spend a flat amount or a random amount from 1 to limit
}

export class SendAction implements Action {
  config: SendActionConfig
  nodes: TestNodeConfig[]
  nodeMap: Map<string, RpcTcpClient> | null
  ready: boolean

  amountSent = 0

  constructor(config: ActionConfig, nodes: TestNodeConfig[]) {
    this.config = config as SendActionConfig
    this.nodes = nodes
    this.ready = true

    this.nodeMap = null
  }

  async addClients(nodes: TestNodeConfig[]): Promise<void> {
    try {
      const clients = await Promise.all(
        nodes.map(async (node): Promise<{ name: string; client: RpcTcpClient }> => {
          const client = new RpcTcpClient(node.tcp_host, node.tcp_port)
          await sleep(1000)
          try {
            const success = await client.tryConnect()
            if (!success) {
              throw new Error(`failed to connect to node ${node.name}`)
            }
          } catch (e) {
            console.log(`error creating client to connect to node ${node.name}: ${String(e)}`)
            throw new Error(`${String(e)}`)
          }

          return new Promise((resolve, reject) => {
            if (!client) {
              reject('wtf')
              return
            }
            resolve({ name: node.name, client })
          })
        }),
      )
      this.nodeMap = new Map<string, RpcTcpClient>(clients.map((c) => [c.name, c.client]))
    } catch (e) {
      console.log('error creating clients to connect to nodes:', e)
    }
  }

  static async initialize(config: ActionConfig, nodes: TestNodeConfig[]): Promise<SendAction> {
    const sendAction = new SendAction(config, nodes)

    await sendAction.addClients(nodes)

    return sendAction
  }

  async sendTransaction(): Promise<{ amount: number; hash: string }> {
    if (this.ready) {
      const to = this.nodeMap?.get(this.config.to)
      const from = this.nodeMap?.get(this.config.from)

      if (!to || !from) {
        throw new Error('to / from nodes not found')
      }

      const spendAmount = Math.round(
        this.config.spendType === 'flat'
          ? this.config.spendLimit
          : Math.random() * this.config.spendLimit,
      )

      const fromAccount = await getDefaultAccount(from)
      const toAccount = await getDefaultAccount(to)

      if (!fromAccount || !toAccount) {
        throw new Error('missing account')
      }

      const toPublicKey = await getAccountPublicKey(to, toAccount)
      if (!isValidPublicAddress(toPublicKey)) {
        throw new Error('invalid public key')
      }

      const txn = await from.sendTransaction({
        account: fromAccount,
        outputs: [
          {
            publicAddress: toPublicKey,
            amount: spendAmount.toString(),
            memo: 'lol',
            assetId: Asset.nativeId().toString('hex'),
          },
        ],
        fee: BigInt(1).toString(),
      })

      this.amountSent += spendAmount

      const hash = txn.content.hash

      console.log('txn sent', { hash, from: fromAccount, to: toPublicKey, amt: spendAmount })

      return { amount: spendAmount, hash }
    } else {
      console.log('not ready')
      return { amount: 0, hash: '' }
    }
  }

  // TODO: make this generic and have pre / post state with a function to validate
  // just compare the states of pre vs post

  // Wrap around a send transaction function to assert the proper amount was sent
  async validateWrapper(fn: () => Promise<{ amount: number; hash: string }>): Promise<void> {
    const dst = this.nodeMap?.get(this.config.to)
    if (!dst) {
      throw new Error('to node not found')
    }
    const toAccount = await getDefaultAccount(dst)

    const toBalance = await getAccountBalance(dst, toAccount)

    const { amount, hash } = await fn()

    // TODO: the wait for the txn to be mined should be more deterministic than sleeping
    // also need a more multi-threaded safe way to do this
    // sleep isn't long enough half the time resulting in invalid txn amts
    await sleep(5000)

    const newToBalance = await getAccountBalance(dst, toAccount)

    const valid = newToBalance === toBalance + amount

    if (!valid) {
      throw new Error(
        'invalid amount sent' +
          JSON.stringify({
            hash,
            expected: toBalance + amount,
            actual: newToBalance,
          }),
      )
    } else {
      console.log('valid amount sent:', hash)
    }
  }

  start(): void {
    console.log('[action] starting transaction action: ', this.config.kind, this.config.name)

    // Send a transaction every 5 seconds and validate the results
    setInterval(() => {
      this.validateWrapper(() => this.sendTransaction()).catch((e) => {
        console.log(`invalid amount sent: ${String(e)}`)
      })
    }, 10 * second)
  }

  stop(): void {
    console.log('[action] stopping transaction action: ', this.config.kind, this.config.name)
    this.ready = false
  }
}

type MintActionConfig = {
  kind: 'mint'
  name: string
  amount: number
  cost: number
}

export class MintAction implements Action {
  config: MintActionConfig
  nodes: TestNodeConfig[]

  constructor(config: ActionConfig, nodes: TestNodeConfig[]) {
    this.config = config as MintActionConfig
    this.nodes = nodes
  }

  start(): void {
    throw new Error('not implemented yet!')
  }

  stop(): void {
    throw new Error('not implemented yet!')
  }
}

async function getDefaultAccount(node: RpcTcpClient): Promise<string> {
  const resp = await node.getDefaultAccount()

  if (resp.content.account === undefined || resp.content.account?.name === undefined) {
    throw new Error('account not found')
  }

  return resp.content.account.name
}

async function getAccountPublicKey(node: RpcTcpClient, account: string): Promise<string> {
  const resp = await node.getAccountPublicKey({ account })

  const publicKey = resp.content.publicKey
  if (publicKey === undefined) {
    throw new Error('public key undefined')
  }

  return publicKey
}

async function getAccountBalance(node: RpcTcpClient, account: string): Promise<number> {
  const resp = await node.getAccountBalance({
    account,
    assetId: Asset.nativeId().toString('hex'),
    confirmations: 0,
  })

  const balance = resp.content.confirmed
  if (balance === undefined) {
    throw new Error('balance undefined')
  }

  return parseInt(balance)
}
