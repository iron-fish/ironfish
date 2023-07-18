import { Blockchain } from "../blockchain"
import { AssetValue } from "../blockchain/database/assetValue"
import { MemPool } from "../memPool"
import { Witness } from "../merkletree"
import { PeerNetwork } from "../network"
import { BlockHeader, Transaction } from "../primitives"
import { NoteEncrypted } from "../primitives/noteEncrypted"
import { WalletNodeClient } from "./walletNodeClient"

export class LocalWalletNodeClient extends WalletNodeClient {
  readonly _chain: Blockchain
  readonly _memPool: MemPool
  readonly _peerNetwork: PeerNetwork

  constructor(
    {
      chain, memPool, peerNetwork
    }: {
    chain: Blockchain,
    memPool: MemPool
    peerNetwork: PeerNetwork
    }
  ) {
    super();
    this._chain = chain
    this._memPool = memPool
    this._peerNetwork = peerNetwork
  }

  chain = {
    getAssetById: (id: Buffer): Promise<AssetValue | null> => {
      return this._chain.getAssetById(id)
    },

    getHeader: (hash: Buffer) :Promise<BlockHeader | null> => {
      return this._chain.getHeader(hash)
    },

    getHeaderAtSequence: (sequence: number): Promise<BlockHeader | null> => {
      return this._chain.getHeaderAtSequence(sequence)
    },

    getNoteWitness: (index: number, size?: number): Promise<Witness<NoteEncrypted, Buffer, Buffer, Buffer> | null> => {
      // TODO(hugh, rohan): Refactor after Blockchain DB is updated
      return this._chain.notes.witness(index, size)
    },

    hasBlock: (hash: Buffer): Promise<boolean> => {
      return this._chain.hasBlock(hash)
    },

    head: (): Promise<{ hash: Buffer, sequence: number}> => {
      const { hash, sequence} = this._chain.head
      return Promise.resolve({ hash, sequence })
    }
  }

  mempool = {
    acceptTransaction: (transaction: Transaction): boolean => {
      return this._memPool.acceptTransaction(transaction)
    }
  }

  peer = {
    broadcastTransaction: (transaction: Transaction): void => {
      return this._peerNetwork.broadcastTransaction(transaction)
    }
  }
}
