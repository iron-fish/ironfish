/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomBytes, timingSafeEqual } from 'crypto'
import { Assert } from '../assert'
import { InternalStore } from '../fileStores'
import { createRootLogger, Logger } from '../logger'
import { IRpcAdapter } from './adapters'
import { ApiNamespace, Router, routes, RpcContext } from './routes'

const AUTH_MAX_LENGTH = 256

export class RpcServer {
  readonly internal: InternalStore
  readonly context: RpcContext
  readonly adapters: IRpcAdapter[] = []

  private _isRunning = false
  private _startPromise: Promise<unknown> | null = null
  private logger: Logger
  private authTokenBuffer = Buffer.alloc(0)

  constructor(
    context: RpcContext,
    internal: InternalStore,
    logger: Logger = createRootLogger(),
  ) {
    this.context = context
    this.internal = internal
    this.logger = logger.withTag('rpcserver')

    this.loadAuth(this.internal.get('rpcAuthToken'))

    this.internal.onConfigChange.on((key, value) => {
      if (key === 'rpcAuthToken') {
        Assert.isString(value)
        this.loadAuth(value)
      }
    })
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  /** Creates a new router from this RpcServer with the attached routes filtered by namespaces */
  getRouter(namespaces: ApiNamespace[]): Router {
    return new Router(routes.filter(namespaces), this)
  }

  /** Starts the RPC server and tells any attached adapters to starts serving requests to the routing layer */
  async start(): Promise<void> {
    if (this._isRunning) {
      return
    }

    await this.generateAuth()

    const promises = this.adapters.map<Promise<void>>((a) => a.start())
    this._startPromise = Promise.all(promises)
    this._isRunning = true
    await this._startPromise
  }

  /** Stops the RPC server and tells any attached adapters to stop serving requests to the routing layer */
  async stop(): Promise<void> {
    if (!this._isRunning) {
      return
    }

    if (this._startPromise) {
      await this._startPromise
    }

    const promises = this.adapters.map<Promise<void>>((a) => a.stop())
    await Promise.all(promises)
    this._isRunning = false
  }

  /** Adds an adapter to the RPC server and starts it if the server has already been started */
  async mount(adapter: IRpcAdapter): Promise<void> {
    this.adapters.push(adapter)
    await adapter.attach(this)

    if (this._isRunning) {
      let promise: Promise<unknown> = adapter.start()

      if (this._startPromise) {
        // Attach this promise to the start promise chain
        // in case we call stop while were still starting up
        promise = Promise.all([this._startPromise, promise])
      }

      this._startPromise = promise
    }
  }

  /** Authenticate the RPC request */
  authenticate(requestAuthToken: string | undefined | null): boolean {
    if (!requestAuthToken) {
      return false
    }

    if (!this.authTokenBuffer.byteLength) {
      return false
    }

    if (requestAuthToken.length > AUTH_MAX_LENGTH) {
      return false
    }

    const requestAuthBuffer = Buffer.alloc(AUTH_MAX_LENGTH)
    requestAuthBuffer.write(requestAuthToken)
    return timingSafeEqual(requestAuthBuffer, this.authTokenBuffer)
  }

  private async generateAuth(): Promise<void> {
    const rpcAuthToken = this.internal.get('rpcAuthToken')

    if (!rpcAuthToken) {
      this.logger.debug(
        `Missing RPC Auth token in internal.json config. Automatically generating auth token.`,
      )
      const newPassword = randomBytes(AUTH_MAX_LENGTH / 2).toString('hex')
      this.internal.set('rpcAuthToken', newPassword)
      await this.internal.save()
    }
  }

  private loadAuth(token: string): void {
    const buffer = Buffer.alloc(AUTH_MAX_LENGTH)
    buffer.write(token)
    this.authTokenBuffer = buffer
  }
}
