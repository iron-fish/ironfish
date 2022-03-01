/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { createRootLogger, Logger } from '../../logger'
import { SetTimeoutToken } from '../../utils/types'
import { MiningPoolMiner } from '../poolMiner'
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
  readonly host: string
  readonly port: number
  readonly miner: MiningPoolMiner
  readonly logger: Logger
  readonly graffiti: Buffer

  private started: boolean
  private connected: boolean
  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null

  requestsSent: { [index: number]: unknown }
  nextMessageId: number

  constructor(options: {
    miner: MiningPoolMiner
    graffiti: Buffer
    host: string
    port: number
    logger?: Logger
  }) {
    this.host = options.host
    this.port = options.port
    this.miner = options.miner
    this.graffiti = options.graffiti
    this.logger = options.logger ?? createRootLogger()

    this.started = false
    this.requestsSent = {}
    this.nextMessageId = 0
    this.connected = false
    this.connectWarned = false
    this.connectTimeout = null

    this.socket = new net.Socket()
    this.socket.on('data', (data) => this.onData(data))
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.logger.info('Connecting to pool...')
    void this.startConnecting()
  }

  private async startConnecting(): Promise<void> {
    const connected = await connectSocket(this.socket, this.host, this.port)
      .then(() => true)
      .catch(() => false)

    if (!this.started) {
      return
    }

    if (!connected) {
      if (!this.connectWarned) {
        this.logger.warn(`Failed to connect to pool at ${this.host}:${this.port}, retrying...`)
        this.connectWarned = true
      }

      this.connectTimeout = setTimeout(() => void this.startConnecting(), 5000)
      return
    }

    this.connectWarned = false
    this.connected = true
    this.onConnect()
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
    this.socket.on('error', this.onError)
    this.socket.on('close', this.onDisconnect)

    this.logger.info('Successfully connected to pool')
    this.logger.info('Listening to pool for new work')
    this.subscribe(this.graffiti)
  }

  private onDisconnect = (): void => {
    this.connected = false
    this.socket.off('error', this.onError)
    this.socket.off('close', this.onDisconnect)

    this.logger.info('Disconnected from pool unexpectedly. Reconnecting.')
    void this.startConnecting()
  }

  private onError = (error: unknown): void => {
    this.logger.error('Startum Error', error)
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

// Transform net.Socket.connect() callback into a nicer promise style interface
function connectSocket(socket: net.Socket, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject): void => {
    const onConnect = () => {
      socket.off('connect', onConnect)
      socket.off('error', onError)
      resolve()
    }

    const onError = (error: unknown) => {
      socket.off('connect', onConnect)
      socket.off('error', onError)
      reject(error)
    }

    socket.on('error', onError)
    socket.on('connect', onConnect)
    socket.connect(port, host)
  })
}
