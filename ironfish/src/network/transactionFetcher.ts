/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { TransactionHash } from '../primitives/transaction'
import { PooledTransactionsRequest } from './messages/pooledTransactions'
import { PeerNetwork } from './peerNetwork'
import { Peer, PeerState } from './peers/peer'

type TransactionState =
  | {
      action: 'REQUEST_SCHEDULED'
      timeout: NodeJS.Timeout
    }
  | {
      peer: Peer
      action: 'IN_FLIGHT'
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
    }
  | {
      action: 'PROCESSING'
    }

/**
 * When a node receives a new transaction hash it needs to query the sender for
 * the full transaction object. This class encapsulates logic for resolving transaction
 * hashes to full transactions from the network. It operates as a state machine. Each transaction
 * hash has it's own state which changes when peers are queried, requests timeout or a
 * full transaction is received from the network
 */
export class TransactionFetcher {
  // State of the current requests for each transaction
  private readonly pending = new BufferMap<TransactionState>()

  // Set of peers that also may be able to fetch the transaction
  private readonly sources = new BufferMap<Set<Peer>>()

  private readonly peerNetwork: PeerNetwork

  constructor(peerNetwork: PeerNetwork) {
    this.peerNetwork = peerNetwork
  }

  /**
   * Called when a new transaction hash is received from the network
   * This schedules requests for the hash to be sent out and if
   * requests are already in progress, it adds the peer as a backup source */
  hashReceived(hash: TransactionHash, peer: Peer): void {
    if (this.peerNetwork.alreadyHaveTransaction(hash)) {
      this.removeTransaction(hash)
      return
    }

    const currentState = this.pending.get(hash)

    if (currentState && currentState.action === 'PROCESSING') {
      return
    }

    const sources = this.sources.get(hash) || new Set<Peer>()
    sources.add(peer)
    this.sources.set(hash, sources)

    if (!currentState) {
      /* Wait 500ms before requesting a new hash to see if we receive the full
       * transaction from the network first */
      const timeout = setTimeout(() => {
        if (this.peerNetwork.alreadyHaveTransaction(hash)) {
          this.removeTransaction(hash)
          return
        }

        this.requestTransaction(hash)
      }, 500)

      this.pending.set(hash, {
        action: 'REQUEST_SCHEDULED',
        timeout,
      })
    }
  }

  /**
   * Called when a transaction has been received from the network
   * but has not yet been processed (validated and added to mempool etc.) */
  receivedTransaction(hash: TransactionHash): void {
    const currentState = this.pending.get(hash)

    if (currentState) {
      this.cleanupCallbacks(currentState)
      this.pending.set(hash, {
        action: 'PROCESSING',
      })
    }
  }

  /**
   * Called when a transaction has been received and confirmed from the network
   * either in a block or in a gossiped transaction request */
  removeTransaction(hash: TransactionHash): void {
    const currentState = this.pending.get(hash)

    currentState && this.cleanupCallbacks(currentState)

    this.pending.delete(hash)
    this.sources.delete(hash)
  }

  private requestFromNextPeer(hash: TransactionHash): void {
    if (this.peerNetwork.alreadyHaveTransaction(hash)) {
      this.removeTransaction(hash)
      return
    }

    // Clear the previous peer request state
    const currentState = this.pending.get(hash)
    currentState && this.cleanupCallbacks(currentState)

    this.requestTransaction(hash)
  }

  stop(): void {
    for (const [hash] of this.pending) {
      this.removeTransaction(hash)
    }
  }

  private requestTransaction(hash: TransactionHash): void {
    // Get the next peer randomly to distribute load more evenly
    const peer = this.popRandomPeer(hash)
    if (!peer) {
      this.pending.delete(hash)
      this.sources.delete(hash)
      return
    }

    const message = new PooledTransactionsRequest([hash])

    const sent = peer.send(message)

    if (!sent) {
      this.requestFromNextPeer(hash)
      return
    }

    const onPeerDisconnect = ({ peer, state }: { peer: Peer; state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        peer.onStateChanged.off(onPeerDisconnect)
        this.requestFromNextPeer(hash)
      }
    }
    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      this.requestFromNextPeer(hash)
    }, 5000)

    this.pending.set(hash, {
      peer,
      action: 'IN_FLIGHT',
      timeout,
      clearDisconnectHandler,
    })
  }

  private popRandomPeer(hash: TransactionHash): Peer | undefined {
    const sources = this.sources.get(hash)

    if (!sources) {
      return undefined
    }

    const nextSourceIndex = Math.floor(Math.random() * sources.size)

    let currIndex = 0
    for (const source of sources) {
      if (nextSourceIndex === currIndex) {
        const nextSource = source
        sources.delete(source)
        return nextSource
      }
      currIndex++
    }

    return undefined
  }

  private cleanupCallbacks(state: TransactionState) {
    if (state.action === 'IN_FLIGHT') {
      clearTimeout(state.timeout)
      state.clearDisconnectHandler()
    } else if (state.action === 'REQUEST_SCHEDULED') {
      clearTimeout(state.timeout)
    }
  }
}
