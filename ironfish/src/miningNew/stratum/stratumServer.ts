/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import net from 'net'
import { Meter } from '../../metrics/meter'
import { IronfishRpcClient } from '../../rpc/clients/rpcClient'
import { IronfishSdk } from '../../sdk'
import { mineableHeaderString } from '../utils'

export class StratumServer {
  readonly server: net.Server
  readonly pool: MiningPool

  // TODO: replace any
  connectedClients: any[]
  // TODO: LRU?
  requestsSent: { [index: number]: any }
  nextMinerId: number
  nextMessageId: number

  currentWork: Buffer | null = null
  currentMiningRequestId: number | null = null

  constructor(pool: MiningPool) {
    this.pool = pool
    this.connectedClients = []
    this.requestsSent = {}
    this.nextMinerId = 0
    this.nextMessageId = 0

    this.server = net.createServer((socket) => {
      console.log('Client connection received')

      socket.on('data', (data) => {
        const splitData = data.toString().trim().split('\n')
        for (const dataString of splitData) {
          const payload = JSON.parse(dataString)
          // Request
          if (payload.method != null) {
            switch (payload.method) {
              case 'mining.subscribe':
                console.log('mining.subscribe request received')
                const graffiti = payload.params
                const newMinerId = this.nextMinerId++

                this.connectedClients[newMinerId] = {
                  socket,
                  graffiti,
                }

                // TODO: create helper fns / types
                const response = {
                  id: this.nextMessageId++,
                  result: newMinerId,
                }
                this.send(socket, response)
                this.send(socket, this.setTargetMessage())
                if (this.hasWork()) {
                  this.send(socket, this.notifyMessage())
                }
                break
              case 'mining.submit':
                console.log('mining.submit request received')
                const submittedRequestId = payload.params[0]
                const submittedRandomness = payload.params[1]
                const submittedGraffiti = payload.params[2]
                this.pool.submitWork(submittedRequestId, submittedRandomness, submittedGraffiti)
                break
              default:
                console.log('unexpected method', payload.method)
            }
          }
          // Response
          else {
            console.log('response received')
          }
        }
      })
    })
  }

  start() {
    this.server.listen(1234, 'localhost')
  }

  newWork(miningRequestId: number, block: SerializedBlockTemplate) {
    this.currentMiningRequestId = miningRequestId
    this.currentWork = mineableHeaderString(block.header)
    console.log('setting current work', this.currentMiningRequestId, this.currentWork)
    this.broadcast(this.notifyMessage())
  }

  hasWork(): boolean {
    return this.currentWork != null
  }

  // TODO: This and other messages can probably be notifications and not full json rpc requests
  // to minimize resource usage and noise
  private notifyMessage(): object {
    return {
      id: this.nextMessageId++,
      method: 'mining.notify',
      params: [this.currentMiningRequestId, this.currentWork?.toString('hex')],
    }
  }

  // TODO: This may change to targetDifficulty once time adjustment comes into play
  private setTargetMessage(): object {
    return {
      id: this.nextMessageId++,
      method: 'mining.set_target',
      params: [this.pool.getTarget()],
    }
  }

  private broadcast(message: object) {
    const msg = JSON.stringify(message) + '\n'
    for (const client of this.connectedClients) {
      client.socket.write(msg)
    }
  }

  private send(socket: net.Socket, message: object) {
    const msg = JSON.stringify(message) + '\n'
    socket.write(msg)
  }
}
