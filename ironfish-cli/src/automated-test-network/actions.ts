/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, isValidPublicAddress } from '@ironfish/rust-nodejs'
import { TestNode } from './testnode'

export interface Action {
  config: ActionConfig
  nodes: Map<string, TestNode>
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
  nodes: Map<string, TestNode>
  ready: boolean

  constructor(config: ActionConfig, nodes: Map<string, TestNode>) {
    this.config = config as SendActionConfig
    this.nodes = nodes
    this.ready = true
  }

  async sendTransaction(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        // TODO: hack to clear interval after stop is called, is this ok?
        if (this.ready) {
          console.log('sending transaction: ', this.config)

          const to = this.nodes.get(this.config.to)
          const from = this.nodes.get(this.config.from)

          if (!to || !from || !to.client || !from.client) {
            reject(new Error('to / from nodes not found'))
            console.log('missing client, skipping txn action')
            return
          }

          const spendAmount = (
            this.config.spendType === 'flat'
              ? this.config.spendLimit
              : Math.random() * this.config.spendLimit
          ).toString()

          console.log('spend amt' + spendAmount)

          const fromAccount = from.getDefaultAccount()
          const toAccount = to.getDefaultAccount()

          if (!fromAccount || !toAccount) {
            reject(new Error('missing account'))
            return
          }

          console.log('from account: ', fromAccount)

          const toPublicKey = to.getDefaultAccountPublicKey()
          if (!toPublicKey || !isValidPublicAddress(toPublicKey)) {
            reject(new Error('invalid public key'))
            return
          }

          console.log('to public key: ', toPublicKey)

          from.client
            .sendTransaction({
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
            .then((resp) => {
              const txn = resp.content.transaction
              console.log('successfully sent txn: ', txn)
            })
            .catch((err) => {
              reject(err)
              return
            })
        } else {
          reject(new Error('not ready'))
          console.log('not ready')
          clearInterval(interval)
          return
        }
      }, 2000)
    })
  }

  start(): void {
    console.log('[action] starting transaction action: ', this.config)

    this.sendTransaction()
      .then()
      .catch((err) => {
        this.ready = false
        console.log('error sending transaction: ', err)
      })
  }

  stop(): void {
    console.log('[action] stopping transaction action: ', this.config)
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
  nodes: Map<string, TestNode>

  constructor(config: ActionConfig, nodes: Map<string, TestNode>) {
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
