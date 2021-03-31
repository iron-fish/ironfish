/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { WasmNote, WasmTransaction, WasmTransactionPosted } from 'ironfish-wasm-nodejs'
import { parentPort, MessagePort } from 'worker_threads'
import { Witness, WitnessSide } from '../captain'
import { NoteHasher } from '.'

type ReceiveRequest = {
  type: 'receive'
  requestId: number
  spenderKey: string
  serializedNote: Buffer
}
type SpendRequest = {
  type: 'spend'
  requestId: number

  spenderKey: string
  serializedNote: Buffer
  serializedWitness: {
    treeSize: number
    authPath: { side: string; hashOfSibling: Buffer }[]
    rootHash: Buffer
  }
}
type PostRequest = {
  type: 'post'
  requestId: number
  spenderKey: string
  changeGoesTo: string | null
  intendedTransactionFee: bigint
}

type PostMinersFeeRequest = { type: 'postMinersFee'; requestId: number }

type Request = ReceiveRequest | SpendRequest | PostRequest | PostMinersFeeRequest

// One transaction per thread accrues all the spends and receipts for that transaction
const transaction = new WasmTransaction()

/**
 * The client has requested that we add a spend to the transaction
 */
function handleSpend(
  port: MessagePort,
  { spenderKey, requestId, serializedNote, serializedWitness }: SpendRequest,
): void {
  const merkleHasher = new NoteHasher()
  const hashSerde = merkleHasher.hashSerde()

  const rootHash = hashSerde.deserialize(serializedWitness.rootHash)
  const authPath = serializedWitness.authPath.map(({ side, hashOfSibling }) => {
    return {
      side: side === 'Left' ? WitnessSide.Left : WitnessSide.Right,
      hashOfSibling: hashSerde.deserialize(hashOfSibling),
    }
  })

  const witness = new Witness(serializedWitness.treeSize, rootHash, authPath, merkleHasher)

  const note = WasmNote.deserialize(serializedNote)

  const error = transaction.spend(spenderKey, note, witness)

  port.postMessage({ requestId, error })
}

/**
 * The client has requested that we add a new received note to the transaction
 */
function handleReceive(
  port: MessagePort,
  { requestId, spenderKey, serializedNote }: ReceiveRequest,
): void {
  const note = WasmNote.deserialize(serializedNote)

  const error = transaction.receive(spenderKey, note)

  port.postMessage({ requestId, error })
}

/**
 * The client has requested that we post a transaction.
 *
 * We post immediately and exit this worker.
 */
function handlePost(
  port: MessagePort,
  { requestId, spenderKey, changeGoesTo, intendedTransactionFee }: PostRequest,
): void {
  const postedTransaction = transaction.post(
    spenderKey,
    changeGoesTo ?? undefined,
    intendedTransactionFee,
  )
  const posted = Buffer.from(postedTransaction.serialize())
  port.postMessage({ requestId, posted })
  process.exit(0)
}

/**
 * The client has requested that we post a miner's fee.
 * A miner's fee should only have one receipt and no spends
 * We try to post it and immediately exit
 */
function handlePostMinersFee(
  port: MessagePort,
  { requestId }: PostMinersFeeRequest,
): WasmTransactionPosted {
  const postedTransaction = transaction.post_miners_fee()
  const posted = Buffer.from(postedTransaction.serialize())
  port.postMessage({ requestId, posted })
  process.exit(0)
}

function handleRequest(port: MessagePort, request: Request) {
  switch (request.type) {
    case 'spend':
      handleSpend(port, request)
      break
    case 'receive':
      handleReceive(port, request)
      break
    case 'post':
      handlePost(port, request)
      break
    case 'postMinersFee':
      handlePostMinersFee(port, request)
      break
  }
}

if (parentPort !== null) {
  const port = parentPort
  port.on('message', (request: Request) => handleRequest(port, request))
}
