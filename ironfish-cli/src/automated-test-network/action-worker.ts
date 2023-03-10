/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
import { isMainThread, MessagePort, parentPort, Worker, workerData } from 'worker_threads'
import { Action, ActionConfig, SendAction } from './actions'
import { TestNodeConfig } from './testnode'

const STATE_FINISHED = 'finished'
const STATE_CANCELLED = 'cancelled'

export class ActionWorker {
  thread: Worker | null = null
  parent: MessagePort | null = null

  actionConfig: ActionConfig
  nodeConfig: TestNodeConfig[]

  action: Action | null = null

  started: boolean

  path: string

  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  constructor(options: {
    actionConfig: ActionConfig
    nodeConfig: TestNodeConfig[]
    parent?: MessagePort
    path?: string
  }) {
    this.actionConfig = options.actionConfig
    this.nodeConfig = options.nodeConfig

    this.parent = options.parent ?? null
    this.path = options.path ?? __filename

    this.started = true

    this.shutdownPromise = new Promise((resolve) => (this.shutdownResolve = resolve))

    // ActionWorker is constructed with a parent port if it is spawned from another thread
    if (options.parent) {
      this.spawned()
    } else {
      this.spawn()
    }
  }

  // spawn the worker thread that starts the action
  spawn(): void {
    Assert.isNull(this.parent)

    // console.log(
    //   'spawning new worker thread for action: ',
    //   this.actionConfig.kind,
    //   this.actionConfig.name,
    // )

    Assert.isNotNull(this.actionConfig)

    this.thread = new Worker(this.path, {
      workerData: {
        config: JSON.stringify(this.actionConfig),
        nodes: JSON.stringify(this.nodeConfig),
      },
    })

    this.thread.addListener('message', (msg) => {
      if (msg === STATE_FINISHED) {
        console.log(
          '[parent]: got finish msg from worker thread, stopping action worker:',
          this.actionConfig.kind,
          this.actionConfig.name,
        )
        if (this.shutdownResolve) {
          this.shutdownResolve()
        }
      }
    })
  }

  // This is called when the worker is spawned from the main thread
  spawned(): void {
    Assert.isNotNull(this.parent)
    this.parent.addListener('message', (msg) => {
      if (msg === STATE_CANCELLED) {
        console.log('[worker] got msg: ', msg, 'stopping worker thread')

        Assert.isNotNull(this.action)
        Assert.isNotNull(this.parent)

        // TODO: could be useful to figure out how to support async events in event listeners
        this.action.stop()
        this.parent.postMessage(STATE_FINISHED)

        return
      }
    })
  }

  // Set the proper action based on the config
  // This needs to be done in the worker thread because functions cannot be serialized
  // and so the action can't be created in the main thread and passed to the worker thread
  async setAction(): Promise<void> {
    console.log(this.actionConfig.kind)
    switch (this.actionConfig.kind) {
      case 'send': {
        this.action = await SendAction.initialize(this.actionConfig, this.nodeConfig)
        break
      }
      case 'mint': {
        throw new Error('Mint action not implemented yet')
      }
      default: {
        throw new Error('Unknown action kind')
      }
    }
  }

  async start(): Promise<void> {
    if (isMainThread) {
      throw new Error("start() can't be called from the main thread")
    }

    Assert.isNotNull(this.parent, 'parent should not be null, this is a worker thread')

    this.parent.postMessage('starting action: ' + this.actionConfig.name)

    if (!this.action) {
      await this.setAction()
    }

    Assert.isNotNull(this.action)

    this.action.start()
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    if (!isMainThread) {
      throw new Error("stop() can't be called from the worker thread")
    }

    this.started = false

    if (this.thread) {
      console.log('sending stop message to worker thread')
      this.thread.postMessage(STATE_CANCELLED)
      await this.waitForShutdown()

      console.log('thread shutdown, cleaning up...')

      this.thread.removeAllListeners()
      await this.thread.terminate()
      this.thread = null
    }
  }
}

// This is the entry point for the worker thread
if (parentPort !== null) {
  // console.log('workerdata', workerData)
  const { config, nodes } = workerData as { config: string; nodes: string }

  const cfg = JSON.parse(config) as ActionConfig
  const nds = JSON.parse(nodes) as TestNodeConfig[]

  //   console.log('spawn action worker:', cfg, nds)
  const worker = new ActionWorker({ actionConfig: cfg, nodeConfig: nds, parent: parentPort })
  void worker.start()
}
