/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, isValidPublicAddress } from '@ironfish/rust-nodejs'
import { RpcTcpClient } from '@ironfish/sdk'
import { TestNodeConfig } from './testnode'
import { sleep } from './utils'

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

  async sendTransaction(): Promise<void> {
    if (this.ready) {
      const to = this.nodeMap?.get(this.config.to)
      const from = this.nodeMap?.get(this.config.from)

      if (!to || !from) {
        throw new Error('to / from nodes not found')
      }

      const spendAmount = Math.floor(
        this.config.spendType === 'flat'
          ? this.config.spendLimit
          : Math.random() * this.config.spendLimit,
      ).toString()

      console.log('spend amt' + spendAmount)

      const fromAccount = await getDefaultAccount(from)
      const toAccount = await getDefaultAccount(to)

      if (!fromAccount || !toAccount) {
        throw new Error('missing account')
        return
      }

      console.log('from account: ', fromAccount)

      const toPublicKey = await getAccountPublicKey(to, toAccount)
      if (!isValidPublicAddress(toPublicKey)) {
        throw new Error('invalid public key')
        return
      }

      console.log('to public key: ', toPublicKey)

      console.log('sending txn', { from: fromAccount, to: toPublicKey, amt: spendAmount })

      const txn = await from.sendTransaction({
        account: fromAccount,
        outputs: [
          {
            publicAddress: toPublicKey,
            amount: spendAmount,
            memo: 'lol',
            assetId: Asset.nativeId().toString('hex'),
          },
        ],
        fee: BigInt(1).toString(),
      })

      console.log('txn sent: ', txn.content.hash)
    } else {
      console.log('not ready')
      return
    }

    return
  }

  start(): void {
    console.log('[action] starting transaction action: ', this.config.kind, this.config.name)

    setInterval(() => {
      this.sendTransaction().catch((err) => {
        console.log('error sending transaction: ', err)
        this.ready = false
      })
    }, 5000)
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
