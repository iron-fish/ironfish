/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import net from 'net'
import { Meter } from '../../metrics/meter'
import { IronfishRpcClient } from '../../rpc/clients/rpcClient'
import { IronfishSdk } from '../../sdk'
import { SerializedBlockTemplate } from '../../serde/BlockTemplateSerde'
import { PromiseUtils } from '../../utils/promise'
import { MiningPoolMiner } from '../miningPoolMiner'
import { mineableHeaderString } from '../utils'
import { StratumNotification, StratumRequest, StratumResponse } from './messages'
import { StratumServer } from './stratumServer'

export class StratumClient {
  readonly socket: net.Socket
  readonly miner: MiningPoolMiner

  requestsSent: { [index: number]: any }
  nextMessageId: number

  constructor(miner: MiningPoolMiner) {
    this.miner = miner
    this.requestsSent = {}
    this.nextMessageId = 0

    this.socket = net.connect(1234, 'localhost')

    this.socket.on('connect', () => {
      console.log('connection established with pool')
    })

    this.socket.on('data', (data) => {
      const splitData = data.toString().trim().split('\n')

      for (const dataString of splitData) {
        const payload = JSON.parse(dataString) as StratumResponse

        // request
        if (payload.method != null) {
          switch (payload.method) {
            case 'mining.set_target':
              console.log('set_target received')
              this.miner.setTarget(payload.params[0])
              break

            case 'mining.notify':
              console.log('mining notify received')
              this.miner.newWork(payload.params[0], payload.params[1])
              break

            default:
              console.log('unrecognized method', payload.method)
          }
        }

        // TODO: add response handling
        // response
        else {
          console.log('response received')
        }
      }
    })
  }

  start(graffiti: string): void {
    const subscribe = {
      id: this.nextMessageId++,
      method: 'mining.subscribe',
      params: graffiti,
    }

    this.send(subscribe)
  }

  submit(miningRequestId: number, randomness: number, graffiti: string): void {
    this.send({
      id: this.nextMessageId++,
      method: 'mining.submit',
      params: [miningRequestId, randomness, graffiti],
    })
  }

  private send(message: StratumRequest) {
    this.socket.write(JSON.stringify(message) + '\n')
    // TODO log requests sent to match responses
  }
}
