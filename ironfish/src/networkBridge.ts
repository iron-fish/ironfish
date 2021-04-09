/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BlockRequestMessage,
  BlocksResponseMessage,
  NewBlockMessage,
  NewTransactionMessage,
  NodeMessageType,
  BlockRequest,
  isBlockRequestPayload,
  isBlocksResponse,
  IncomingPeerMessage,
} from './network/messages'
import { Assert } from './assert'
import { PeerNetwork, RoutingStyle } from './network'
import { IronfishNode } from './node'
import { SerializedTransaction, SerializedWasmNoteEncrypted } from './strategy'
import { BlockHash } from './captain'
import { NetworkBlockType } from './captain/blockSyncer'

export class NetworkBridge {
  node: IronfishNode | null = null
  peerNetwork: PeerNetwork | null = null

  /** Attach to the message handlers of a PeerNetwork and forward them toward an IronfishNode */
  attachPeerNetwork(peerNetwork: PeerNetwork): void {
    Assert.isNull(this.peerNetwork)
    this.peerNetwork = peerNetwork

    peerNetwork.registerHandler(
      NodeMessageType.Blocks,
      RoutingStyle.globalRPC,
      (p) => (isBlockRequestPayload(p) ? Promise.resolve(p) : Promise.reject('Invalid format')),
      (message) => this.onBlockRequest(message),
    )

    peerNetwork.registerHandler(
      NodeMessageType.NewBlock,
      RoutingStyle.gossip,
      (p) => {
        Assert.isNotNull(this.node, 'No attached node')
        Assert.isNotNull(this.node.captain, 'No attached node')

        return this.node.captain.chain.verifier.verifyNewBlock(p)
      },
      (message) => this.onNewBlock(message),
    )

    peerNetwork.registerHandler(
      NodeMessageType.NewTransaction,
      RoutingStyle.gossip,
      (p) => {
        Assert.isNotNull(this.node, 'No attached node')
        Assert.isNotNull(this.node.captain, 'No attached node')
        return this.node.captain.chain.verifier.verifyNewTransaction(p)
      },
      async (message) => await this.onNewTransaction(message),
    )

    peerNetwork.onIsReadyChanged.on((isReady) => this.onPeerNetworkReadyChanged(isReady))
    this.onPeerNetworkReadyChanged(peerNetwork.isReady)
  }

  /** Attach to the events of an IronfishNode and forward them toward a PeerNetwork */
  attachNode(node: IronfishNode): void {
    Assert.isNull(this.node)
    this.node = node

    Assert.isNotNull(this.node.captain)

    this.node.captain.onNewBlock.on((block) => {
      Assert.isNotNull(this.node)
      Assert.isNotNull(this.node.captain)
      Assert.isNotNull(this.peerNetwork)

      const serializedBlock = this.node.captain.blockSerde.serialize(block)

      this.peerNetwork.gossip({
        type: NodeMessageType.NewBlock,
        payload: {
          block: serializedBlock,
        },
      })
    })

    this.node.accounts.onBroadcastTransaction.on((transaction) => {
      if (this.peerNetwork === null) return

      Assert.isNotNull(this.node)
      Assert.isNotNull(this.node.captain)

      const serializedTransaction = this.node.captain.strategy
        .transactionSerde()
        .serialize(transaction)

      this.peerNetwork.gossip({
        type: NodeMessageType.NewTransaction,
        payload: { transaction: serializedTransaction },
      })
    })

    this.node.captain.onRequestBlocks.on((hash: BlockHash, nextBlockDirection: boolean) => {
      Assert.isNotNull(this.node)
      Assert.isNotNull(this.node.captain)
      Assert.isNotNull(this.peerNetwork)
      Assert.isNotNull(this.node)

      const serializedHash = this.node.captain.chain.blockHashSerde.serialize(hash)

      const request: BlockRequest = {
        type: NodeMessageType.Blocks,
        payload: {
          hash: serializedHash,
          nextBlockDirection: nextBlockDirection,
        },
      }

      this.peerNetwork
        .request(request)
        .then((c) => {
          if (
            !c ||
            !isBlocksResponse<SerializedWasmNoteEncrypted, SerializedTransaction>(c.message)
          ) {
            throw new Error('Invalid format')
          }
          this.onBlockResponses(
            {
              ...c,
              message: c.message,
            },
            request,
          )
        })
        .catch((err) => {
          this.node?.captain?.blockSyncer.handleBlockRequestError(request, err)
        })
    })
  }

  /** Attach to the events of a WebWorker and forward them to/from an IronfishNode */
  attachFromWebWorker(): void {
    throw new Error(`Not implemented yet`)
  }

  /** Attach to the events of a WebWorker and forward them to/from a PeerNetwork */
  attachToWebWorker(): void {
    throw new Error(`Not implemented yet`)
  }

  private onBlockRequest(message: IncomingPeerMessage<BlockRequestMessage>) {
    Assert.isNotNull(this.node)
    Assert.isNotNull(this.node.captain)
    return this.node.captain.blockSyncer.handleBlockRequest(message)
  }

  private onBlockResponses(
    message: IncomingPeerMessage<BlocksResponseMessage>,
    originalRequest: BlockRequest,
  ) {
    Assert.isNotNull(this.node)
    Assert.isNotNull(this.node.captain)
    return this.node.captain.blockSyncer.handleBlockResponse(message, originalRequest)
  }

  private onNewBlock(message: IncomingPeerMessage<NewBlockMessage>) {
    Assert.isNotNull(this.node)
    Assert.isNotNull(this.node.captain)
    const block = message.message.payload.block
    return this.node.captain.blockSyncer.addBlockToProcess(block, NetworkBlockType.GOSSIP)
  }

  private async onNewTransaction(
    message: IncomingPeerMessage<NewTransactionMessage>,
  ): Promise<void> {
    Assert.isNotNull(this.node)
    const transaction = message.message.payload.transaction

    if (this.node.memPool.acceptTransaction(transaction)) {
      await this.node.accounts.syncTransaction(transaction, {})
    }

    await Promise.resolve()
  }

  private onPeerNetworkReadyChanged(isReady: boolean): void {
    if (isReady) {
      this.node?.onPeerNetworkReady()
    } else {
      this.node?.onPeerNetworkNotReady()
    }
  }
}
