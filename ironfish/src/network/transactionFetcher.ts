/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { MemPool } from '../memPool'
import { Transaction, TransactionHash } from '../primitives/transaction'
import { PooledTransactionsRequest } from './messages/pooledTransactions'
import { Peer, PeerState } from './peers/peer'

type TxState =
  | {
      peer: Peer
      action: 'REQUEST_SCHEDULED'
      timeout: NodeJS.Timeout
    }
  | {
      peer: Peer
      action: 'IN_FLIGHT'
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
    }

/**
 * When a node receives a new transaction hash is needs to query the sender for
 * the full transaction object. This class encapsulates logic for resolving transaction
 * hashes to full transactions from the network. It operates as a state machine. Each transaction
 * hash has it's own state which changes when peers are queried, requests timeout or a
 * full transaction is received from the network
 */
export class TxFetcher {
  // State of the current requests for each transaction
  private readonly pending = new BufferMap<TxState>()

  // Set of peers that also may be able to fetch the transaction
  private readonly sources = new BufferMap<Set<Peer>>()

  private readonly memPool: MemPool

  constructor(memPool: MemPool) {
    this.memPool = memPool
  }

  /* Called when a new transaction hash is received from the newtork
   * This schedules requests for the hash to be sent out and if
   * requests are already in progress, it adds the peer as a backup source */
  addSource(hash: TransactionHash, peer: Peer): void {
    if (this.isResolved(hash)) {
      this.removeState(hash)
      return
    }

    const currentState = this.pending.get(hash)

    if (currentState && currentState.peer === peer) {
      return
    }

    const sources = this.sources.get(hash) || new Set<Peer>()
    sources.add(peer)
    this.sources.set(hash, sources)

    if (!currentState) {
      this.fetchFromNextSource(hash)
    }
  }

  /* Called when a transaction is received and confirmed from the network
   * either in a block or in a gossiped transaction request */
  resolve(transaction: Transaction): void {
    this.removeState(transaction.hash())
  }

  private fetchFromNextSource(hash: TransactionHash): void {
    if (this.isResolved(hash)) {
      this.removeState(hash)
      return
    }

    // Clear the previous source
    const currentState = this.pending.get(hash)
    currentState && this.cleanupCallbacks(currentState)

    // Get the next source
    const peer = this.popSource(hash)
    if (!peer) {
      this.pending.delete(hash)
      return
    }

    const timeout = setTimeout(() => this.sendRequest(hash, peer), 500)

    this.pending.set(hash, {
      peer,
      action: 'REQUEST_SCHEDULED',
      timeout,
    })
  }

  private sendRequest(hash: TransactionHash, peer: Peer): void {
    if (this.isResolved(hash)) {
      this.removeState(hash)
      return
    }

    const message = new PooledTransactionsRequest([hash])

    const sent = peer.send(message)

    if (!sent) {
      this.fetchFromNextSource(hash)
      return
    }

    const onPeerDisconnect = ({ peer, state }: { peer: Peer; state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        peer.onStateChanged.off(onPeerDisconnect)
        this.fetchFromNextSource(hash)
      }
    }
    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      this.fetchFromNextSource(hash)
    }, 5000)

    this.pending.set(hash, {
      peer,
      action: 'IN_FLIGHT',
      timeout,
      clearDisconnectHandler,
    })
  }

  private popSource(hash: TransactionHash): Peer | undefined {
    const sources = this.sources.get(hash)

    if (!sources) {
      return undefined
    }

    let nextSource
    for (const source of sources.values()) {
      nextSource = source
      break
    }

    if (nextSource) {
      sources.delete(nextSource)
    }

    return nextSource
  }

  private removeState(hash: TransactionHash): void {
    const currentState = this.pending.get(hash)

    currentState && this.cleanupCallbacks(currentState)

    this.pending.delete(hash)
    this.sources.delete(hash)
  }

  private cleanupCallbacks(state: TxState) {
    if (state.action === 'IN_FLIGHT') {
      clearTimeout(state.timeout)
      state.clearDisconnectHandler()
    } else if (state.action === 'REQUEST_SCHEDULED') {
      clearTimeout(state.timeout)
    }
  }

  private isResolved(hash: TransactionHash): boolean {
    // TODO: Also check transactions recently added to the chain
    return this.memPool.exists(hash)
  }
}
