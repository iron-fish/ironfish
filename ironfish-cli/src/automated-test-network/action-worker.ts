/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
import { isMainThread, MessagePort, parentPort, Worker, workerData } from 'worker_threads'
import { Action, ActionConfig, MintAction, SendAction } from './actions'
import { TestNode } from './testnode'

const STATE_FINISHED = 'finished'
const STATE_CANCELLED = 'cancelled'

export class ActionWorker {
  thread: Worker | null = null
  parent: MessagePort | null = null

  config: ActionConfig
  action: Action | null = null
  nodes: TestNode[]
  nodeMap: Map<string, TestNode>

  started: boolean

  path: string

  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  constructor(options: {
    config: ActionConfig
    nodes: TestNode[]
    parent?: MessagePort
    path?: string
  }) {
    this.config = options.config
    this.nodes = options.nodes

    this.nodeMap = new Map<string, TestNode>(options.nodes.map((node) => [node.name, node]))

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

    console.log('spawning new worker thread for action: ', this.config)

    Assert.isNotNull(this.config)

    this.thread = new Worker(this.path, {
      workerData: { config: JSON.stringify(this.config), nodes: JSON.stringify(this.nodes) },
    })

    this.thread.addListener('message', (msg) => {
      if (msg === STATE_FINISHED) {
        console.log(
          '[parent]: got finish msg from worker thread, stopping action worker:',
          this.config,
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

    console.log('[worker] spawned from parent thread, starting action: ', this.config)
    // The action must be created in the child thread because functions cannot be serialized
    this.setAction()
    this.start()
  }

  // Set the proper action based on the config
  // This needs to be done in the worker thread because functions cannot be serialized
  // and so the action can't be created in the main thread and passed to the worker thread
  setAction(): void {
    let action: Action
    switch (this.config.kind) {
      case 'send': {
        action = new SendAction(this.config, this.nodeMap)
        break
      }
      case 'mint': {
        action = new MintAction(this.config, this.nodeMap)
        break
      }
      default: {
        throw new Error('Unknown action kind')
      }
    }
    this.action = action
  }

  private start(): void {
    if (isMainThread) {
      throw new Error("start() can't be called from the main thread")
    }

    Assert.isNotNull(this.parent, 'parent should not be null, this is a worker thread')

    this.parent.postMessage('starting action: ' + this.config.name)

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
  const nds = JSON.parse(nodes) as TestNode[]

  new ActionWorker({ config: cfg, nodes: nds, parent: parentPort })
}
