import { AssetValue } from "../blockchain/database/assetValue"
import { Witness } from "../merkletree"
import { BlockHeader, Transaction } from "../primitives"
import { NoteEncrypted } from "../primitives/noteEncrypted"

export abstract class WalletNodeClient {
  abstract chain: {
    getAssetById: (id: Buffer) => Promise<AssetValue | null>
    getHeader: (hash: Buffer) => Promise<BlockHeader | null>
    getHeaderAtSequence: (sequence: number) => Promise<BlockHeader | null>
    getNoteWitness: (index: number, size?: number) => Promise<Witness<NoteEncrypted, Buffer, Buffer, Buffer> | null>
    hasBlock: (hash: Buffer) => Promise<boolean>
    head: () => Promise<{ hash: Buffer, sequence: number}>
  }

  abstract mempool: {
    acceptTransaction: (transaction: Transaction) => void
  }

  abstract peer: {
    broadcastTransaction: (transaction: Transaction) => void
  }
}
