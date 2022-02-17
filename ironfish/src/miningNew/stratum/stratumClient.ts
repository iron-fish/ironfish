/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { createRootLogger, Logger } from '../../logger'
import { MiningPoolMiner } from '../miningPoolMiner'
import {
  StratumMessageMiningNotify,
  StratumMessageMiningSetTarget,
  StratumMessageMiningSubmit,
  StratumMessageMiningSubscribe,
  StratumRequest,
  StratumResponse,
} from './messages'

export class StratumClient {
  readonly socket: net.Socket
  readonly miner: MiningPoolMiner
  readonly logger: Logger

  requestsSent: { [index: number]: unknown }
  nextMessageId: number

  constructor(miner: MiningPoolMiner) {
    this.miner = miner
    this.logger = createRootLogger()
    this.requestsSent = {}
    this.nextMessageId = 0

    this.socket = new net.Socket()
    this.socket.on('connect', () => this.onConnect())
    this.socket.on('data', (data) => this.onData(data))
  }

  start(): void {
    this.socket.connect(1234, 'localhost')
  }

  stop(): void {
    this.socket.end()
  }

  subscribe(graffiti: Buffer): void {
    const message: StratumMessageMiningSubscribe = {
      id: this.nextMessageId++,
      method: 'mining.subscribe',
      params: graffiti.toString('hex'),
    }

    this.send(message)
  }

  submit(miningRequestId: number, randomness: number, graffiti: Buffer): void {
    const message: StratumMessageMiningSubmit = {
      id: this.nextMessageId++,
      method: 'mining.submit',
      params: [miningRequestId, randomness, graffiti.toString('hex')],
    }

    this.send(message)
  }

  private send(message: StratumRequest) {
    this.socket.write(JSON.stringify(message) + '\n')
    // TODO log requests sent to match responses
  }

  private onConnect(): void {
    this.logger.info('connection established with pool')
  }

  private onData(data: Buffer): void {
    const splitData = data.toString().trim().split('\n')

    for (const dataString of splitData) {
      const payload = JSON.parse(dataString) as StratumResponse

      // request
      if (payload.method != null) {
        switch (payload.method) {
          case 'mining.set_target': {
            this.logger.info('set_target received')

            const message = payload as StratumMessageMiningSetTarget
            this.miner.setTarget(message.params[0])
            break
          }

          case 'mining.notify': {
            this.logger.info('mining notify received')

            const message = payload as StratumMessageMiningNotify
            this.miner.newWork(message.params[0], message.params[1])
            break
          }

          default:
            this.logger.info('unrecognized method', payload.method)
        }
      } else {
        // TODO: add response handling
        this.logger.info('response received')
      }
    }
  }
}
