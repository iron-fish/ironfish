/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { MemPool } from '../memPool'
import { Transaction, TransactionHash } from '../primitives/transaction'
import { PooledTransactionsRequest } from './messages/pooledTransactions'
import { Peer, PeerState } from './peers/peer'

/**
 * When a node receives a new transaction hash is needs to query the sender for
 * the full transaction object. This class encapsulates logic for resolving transaction
 * hashes to full transactions from the network
 */
export class TxFetcher {
  private readonly pending = new BufferMap<
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
  >()

  private readonly sources = new BufferMap<Set<Peer>>()

  private readonly memPool: MemPool

  constructor(memPool: MemPool) {
    this.memPool = memPool
  }

  addSource(hash: TransactionHash, peer: Peer): void {
    if (this.alreadyResolved(hash)) {
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

  fetchFromNextSource(hash: TransactionHash): void {
    if (this.alreadyResolved(hash)) {
      this.pending.delete(hash)
      return
    }

    // Clear the previous source
    const currentState = this.pending.get(hash)
    if (currentState && currentState.action === 'IN_FLIGHT') {
      clearTimeout(currentState.timeout)
      currentState.clearDisconnectHandler()
    } else if (currentState && currentState.action === 'REQUEST_SCHEDULED') {
      clearTimeout(currentState.timeout)
    }

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

  sendRequest(hash: TransactionHash, peer: Peer): void {
    if (this.alreadyResolved(hash)) {
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

  transactionResolved(transaction: Transaction): void {
    const hash = transaction.hash()
    const currentState = this.pending.get(hash)

    if (currentState && currentState.action === 'IN_FLIGHT') {
      currentState.clearDisconnectHandler()
    }

    if (currentState) {
      clearTimeout(currentState.timeout)
    }

    this.pending.delete(hash)
    this.sources.delete(hash)
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

  private alreadyResolved(hash: TransactionHash): boolean {
    // TODO(daniel): Also return transactions that were recently added to the chain
    return this.memPool.exists(hash)
  }
}
