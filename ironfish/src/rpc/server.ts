/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishNode } from '../node'
import { ArrayUtils } from '../utils'
import { IAdapter } from './adapters'
import { ApiNamespace, Router, router } from './routes'

export class RpcServer {
  readonly node: IronfishNode

  private readonly adapters: IAdapter[] = []
  private readonly router: Router
  private _isRunning = false
  private _startPromise: Promise<unknown> | null = null

  constructor(node: IronfishNode) {
    this.node = node
    this.router = router
    this.router.server = this
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  /** Creates a new router from this RpcServer with the attached routes filtered by namespaces */
  getRouter(namespaces: ApiNamespace[]): Router {
    return this.router.filter(namespaces)
  }

  /** Starts the RPC server and tells any attached adapters to starts serving requests to the routing layer */
  async start(): Promise<void> {
    if (this._isRunning) {
      return
    }

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
  async mount(adapter: IAdapter): Promise<void> {
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

  async unmount(adapter: IAdapter): Promise<boolean> {
    const removed = ArrayUtils.remove(this.adapters, adapter)

    if (removed) {
      await adapter.stop()
      await adapter.unattach()
    }

    return removed
  }
}
