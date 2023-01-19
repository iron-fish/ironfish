/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, Logger } from '@ironfish/sdk'
import net from 'net'

export class CeremonyClient {
  readonly socket: net.Socket
  readonly host: string
  readonly port: number
  readonly logger: Logger

  constructor(options: { host: string; port: number; logger: Logger }) {
    this.host = options.host
    this.port = options.port
    this.logger = options.logger

    this.socket = new net.Socket()
    this.socket.on('data', (data) => void this.onData(data))
  }

  async start(): Promise<void> {
    this.logger.info('Connecting...')
    const connected = await connectSocket(this.socket, this.host, this.port)
      .then(() => true)
      .catch((e) => {
        this.logger.info('connection error')
        return false
      })

    if (connected) {
      this.logger.info('Successfully connected')
      this.socket.on('error', this.onError)
      this.socket.on('close', this.onDisconnect)
    } else {
      this.logger.info('Connection not successful')
    }
  }

  stop(): void {
    this.socket.end()
  }

  send(message: string): void {
    this.socket.write(message + '\n')
  }

  private onDisconnect = (): void => {
    this.socket.off('error', this.onError)
    this.socket.off('close', this.onDisconnect)
    // TODO: Reconnect
  }

  private onError = (error: unknown): void => {
    this.logger.error(`Server error ${ErrorUtils.renderError(error)}`)
  }

  private onData(data: Buffer): void {
    const message = data.toString('utf-8')
    this.logger.info(`Recieved message: ${message}`)
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
