/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
//
// TODO: This file depends on nodejs librarys (worker-threads) and will not
// work with browser workers. This will need to be abstracted in future.

import { Worker } from 'worker_threads'
import {
  IronfishNote,
  IronfishNoteEncrypted,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  WasmNoteEncryptedHash,
} from '.'
import { Witness } from '../merkletree'
import { WorkerPool } from '../workerPool'

// Messages that the asyncTransactionWorker knows how to handle
type Request =
  | { type: 'receive'; spenderKey: string; serializedNote: Buffer }
  | {
      type: 'spend'
      spenderKey: string
      serializedNote: Buffer
      serializedWitness: {
        treeSize: number
        authPath: { side: string; hashOfSibling: Buffer }[]
        rootHash: Buffer
      }
    }
  | { type: 'postMinersFee' }
  | {
      type: 'post'
      spenderKey: string
      changeGoesTo: string | null
      intendedTransactionFee: bigint
    }

/**
 * Wrapper of WasmTransaction that performs the work
 * in a node worker thread.
 *
 * The entire transaction is created in the worker thread
 * and spends and receipts happen there.
 *
 * Only when it is posted is the transaction returned
 * to this thread.
 */
export default class AsyncTransaction {
  worker: Worker
  resolvers: Record<number, (response: { posted?: Buffer; error?: string }) => void>
  lastRequestId: number
  isPosted: boolean

  constructor() {
    // I hate it. I hate it so hard.
    // Works around that ts-jest cannot find the file
    let dir = __dirname
    if (dir.includes('ironfish/src/strategy')) {
      dir = dir.replace('ironfish/src/strategy', 'ironfish/build/src/strategy')
    }
    this.worker = new Worker(dir + '/asyncTransactionWorker.js')
    this.worker.on('message', (value) => this.promisifyResponse(value))
    this.resolvers = {}
    this.lastRequestId = 0
    this.isPosted = false
  }

  /**
   * Instruct the worker thread to create a receipt proof for
   * the provided parameters and attach the receipt to the transaction.
   */
  async receive(spenderKey: string, note: IronfishNote): Promise<string> {
    const serializedNote = note.serialize()
    const response = await this.promisifyRequest({
      type: 'receive',
      spenderKey,
      serializedNote,
    })
    return response.error ?? 'Unknown response'
  }

  /**
   * Instruct the worker thread to create a spend proof for the
   * provided parameters and attach it to the transaction.
   */
  async spend(
    spenderKey: string,
    note: IronfishNote,
    witness: Witness<
      IronfishNoteEncrypted,
      WasmNoteEncryptedHash,
      SerializedWasmNoteEncrypted,
      SerializedWasmNoteEncryptedHash
    >,
  ): Promise<string> {
    const authPath = witness.authPath().map((p) => {
      return { side: p.side(), hashOfSibling: p.hashOfSibling() }
    })
    const serializedNote = note.serialize()
    const response = await this.promisifyRequest({
      type: 'spend',
      spenderKey,
      serializedNote,
      serializedWitness: {
        treeSize: witness.treeSize(),
        rootHash: witness.serializeRootHash(),
        authPath,
      },
    })
    return response.error ?? 'Unknown response'
  }

  /**
   * Post the transaction as a miner's fee.
   *
   * A miner's fee transaction should have one receipt and zero spends.
   *
   * @returns a promise with the posted transaction
   */
  async postMinersFee(workerPool: WorkerPool): Promise<IronfishTransaction> {
    const serializedPosted = await this.promisifyRequest({
      type: 'postMinersFee',
    })
    if (!serializedPosted?.posted) {
      throw new Error('Unable to post transaction')
    }
    this.isPosted = true
    return new IronfishTransaction(serializedPosted.posted, workerPool)
  }

  /**
   * Post the transaction with its current list of spends and receipts.
   *
   * @returns a promise with the posted transaction
   */
  async post(
    spenderKey: string,
    changeGoesTo: string | null,
    intendedTransactionFee: bigint,
    workerPool: WorkerPool,
  ): Promise<IronfishTransaction> {
    const serializedPosted = await this.promisifyRequest({
      type: 'post',
      spenderKey,
      changeGoesTo,
      intendedTransactionFee,
    })
    if (!serializedPosted?.posted) {
      throw new Error('Unable to post transaction')
    }
    this.isPosted = true
    return new IronfishTransaction(serializedPosted.posted, workerPool)
  }

  /**
   * Cancel the worker thread and discard the transaction
   */
  async cancel(): Promise<void> {
    await this.worker.terminate()
  }

  /**
   * Send a request to the worker thread,
   * giving it an id and constructing a promise that can be resolved
   * when the worker thread has issued a response message.
   */
  private promisifyRequest(request: Request): Promise<{ posted?: Buffer; error?: string }> {
    if (this.isPosted) {
      throw new Error('This transaction has already been posted')
    }
    const requestId = this.lastRequestId++
    const promise: Promise<{ posted?: Buffer; error?: string }> = new Promise((resolve) => {
      this.resolvers[requestId] = (posted) => resolve(posted)
    })
    this.worker.postMessage({ ...request, requestId })
    return promise
  }

  /**
   * Listener for worker thread messages that looks up which request
   * is being responded to and fulfills the promise
   *
   * Sends and receipts return a string that is either empty or an error message.
   * the two post methods return a posted transaction
   */
  promisifyResponse(response: { requestId: number; posted?: Buffer; error?: string }): void {
    const resolver = this.resolvers[response.requestId]
    if (resolver) {
      resolver({ posted: response.posted, error: response.error })
    }
    delete this.resolvers[response.requestId]
  }
}
