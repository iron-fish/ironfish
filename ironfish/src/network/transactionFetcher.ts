/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { TransactionHash } from '../primitives/transaction'
import { ArrayUtils } from '../utils'
import { Identity } from './identity'
import { PooledTransactionsRequest } from './messages/pooledTransactions'
import { PeerNetwork } from './peerNetwork'
import { Peer, PeerState } from './peers/peer'

/* Wait 1s before requesting a new hash to see if we receive the full
 * transaction from the network first */
const WAIT_BEFORE_REQUEST_MS = 1000

type TransactionState =
  | {
      action: 'REQUEST_SCHEDULED'
      timeout: NodeJS.Timeout
      sources: Set<Identity>
    }
  | {
      peer: Peer
      action: 'IN_FLIGHT'
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Set<Identity>
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

  private readonly peerNetwork: PeerNetwork

  constructor(peerNetwork: PeerNetwork) {
    this.peerNetwork = peerNetwork
  }

  /**
   * Called when a new transaction hash is received from the network
   * This schedules requests for the hash to be sent out and if
   * requests are already in progress, it adds the peer as a backup source */
  hashReceived(hash: TransactionHash, peer: Peer): void {
    // If the peer is not connected or identified, don't add them as a source
    if (!peer.state.identity) {
      return
    }

    const currentState = this.pending.get(hash)

    if (currentState && currentState.action === 'PROCESSING') {
      return
    }

    currentState?.sources.add(peer.state.identity)

    if (!currentState) {
      const timeout = setTimeout(() => {
        this.requestTransaction(hash)
      }, WAIT_BEFORE_REQUEST_MS)

      this.pending.set(hash, {
        action: 'REQUEST_SCHEDULED',
        timeout,
        sources: new Set<Identity>([peer.state.identity]),
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
  }

  private requestFromNextPeer(hash: TransactionHash): void {
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
    const currentState = this.pending.get(hash)

    if (currentState === undefined || currentState.action === 'PROCESSING') {
      return
    }

    const sources = currentState.sources

    // Get the next peer randomly to distribute load more evenly
    const peer = this.popRandomPeer(sources)

    if (!peer) {
      this.removeTransaction(hash)
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
      sources,
    })
  }

  private popRandomPeer(sources: Set<Identity>): Peer | null {
    const random = ArrayUtils.shuffle([...sources])

    let nextPeer = null
    let nextPeerId = null
    while (nextPeer === null && random.length > 0) {
      nextPeerId = random.pop()
      Assert.isNotUndefined(nextPeerId) // random.length > 0 in the while loop

      nextPeer = this.peerNetwork.peerManager.getPeer(nextPeerId)
    }

    // remove the peer from sources if we have one
    nextPeerId && sources.delete(nextPeerId)

    return nextPeer
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
