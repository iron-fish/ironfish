/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

declare module 'event-pubsub' {
  export class EventPubSub {
    // eslint-disable-next-line @typescript-eslint/ban-types
    on(type: string, handler: Function, once: boolean): EventPubSub
    // eslint-disable-next-line @typescript-eslint/ban-types
    once(type: string, handler: Function): EventPubSub
    // eslint-disable-next-line @typescript-eslint/ban-types
    off(type: string, handler: Function): EventPubSub
    emit(type: string): EventPubSub
    emit$(type: string, args: unknown[]): EventPubSub
  }

  export default EventPubSub
}

declare module 'node-ipc' {
  import net from 'net'
  import dgram from 'dgram'
  import EventPubSub from 'event-pubsub'

  export type IpcSocketId = string

  export type IpcSocket = {
    id: IpcSocketId | undefined
    ipcBuffer: string | undefined
  } & (net.Socket | dgram.Socket)

  export class IpcServer extends EventPubSub {
    sockets: IpcSocket[]
    start(): void
    stop(): void
    server: net.Server | dgram.Socket

    on(name: 'start', callback: (socket: IpcSocket) => void): void
    on(name: 'data', callback: (data: unknown, socket: IpcSocket) => void): void
    on(name: 'error', callback: (error: unknown) => void): void
    on(name: 'connect', callback: (socket: IpcSocket) => void): void
    on(name: 'close', callback: (hasError?: boolean) => void): void
    on(
      name: 'socket.disconnected',
      callback: (socket: IpcSocket, destroyedSocketId: IpcSocketId | false) => void,
    ): void
    on(name: string, callback: (data: unknown, socket: IpcSocket) => void): void

    emit(socket: IpcSocket, event: name, data: unknown): void
    broadcast(event: name, data: unknown): void
  }

  export type IpcClient = {
    id: IpcSocketId | undefined
    path: string | undefined
    port?: number

    config: IpcConfig
    queue: Queue
    socket: IpcSocket | false
    log: unknown
    retriesRemaining: number
    explicitlyDisconnected: boolean

    connect(): void
    emit(name: string, data: unknown): void

    on(event: 'connect', callback: () => void)
    on(event: 'error', callback: (error: unknown) => void)
    on(event: 'disconnect', callback: () => void)
    on(event: 'destroy', callback: () => void)
    on(event: 'data', callback: (data: Buffer) => void)
    on(event: string, callback: (data: unknown) => void)

    // eslint-disable-next-line @typescript-eslint/ban-types
    off(name: string | '*', handler: Function | '*'): void
  }

  export type IpcUdpType = 'udp4' | 'udp6'

  export class IPC {
    config: IpcConfig

    // TODO: serveNet actually allows all combination of
    // parameters as long as they are in the same order
    // which cannot be typed by typescript very easily so
    // we only type the most commonly used variations here
    serveNet(host?: string, port?: number, udpType?: IpcUdpType, callback?: () => void): void
    serveNet(host?: string, port?: number, callback?: () => void): void
    serveNet(port?: number, udpType?: IpcUdpType, callback?: () => void): void
    serveNet(udpType?: IpcUdpType, callback?: () => void): void
    serveNet(callback?: () => void): void

    serve(path?: string, callback?: () => void): void
    serve(callback?: () => void): void

    connectTo(id: string, path?: string, callback?: () => void): void
    connectTo(id: string, callback?: () => void): void

    connectToNet(id: string, host?: string, port?: number, callback?: () => void): void
    connectToNet(id: string, callback?: () => void): void

    disconnect(id: IpcSocketId): void

    of: Record<IpcSocketId, IpcClient>
    server: IpcServer
  }

  export type IpcConfig = {
    appSpace: string
    socketRoot: string
    id: string

    encoding: string
    rawBuffer: boolean
    sync: boolean
    unlink: boolean

    delimiter: string

    silent: boolean
    logDepth: number
    logInColor: boolean
    logger: typeof console.log

    maxConnections: number
    retry: number
    maxRetries: number
    stopRetrying: boolean

    IPType: string
    tls: boolean
    networkHost: '::1' | '127.0.0.1'
    networkPort: number

    interface: {
      localAddress: boolean
      localPort: boolean
      family: boolean
      hints: boolean
      lookup: boolean
    }
  }
}
