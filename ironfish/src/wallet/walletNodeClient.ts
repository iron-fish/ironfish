import { AssetValue } from "../blockchain/database/assetValue"
import { Witness } from "../merkletree"
import { BlockHeader, Transaction } from "../primitives"
import { NoteEncrypted } from "../primitives/noteEncrypted"

export abstract class WalletNodeClient {
  // abstract(
  //   route: string,
  //   data?: unknown,
  //   options?: { timeoutMs?: number | null },
  // ): RpcResponse<TEnd, TStream>

  abstract mempool: {
    acceptTransaction: (transaction: Transaction) => void
  }

  abstract chain: {
    broadcastTransaction: (transaction: Transaction) => void
    getAssetById: (id: Buffer) => Promise<AssetValue | null>
    getHeader: (hash: Buffer) => Promise<BlockHeader | null>
    getHeaderAtSequence: (sequence: number) => Promise<BlockHeader | null>
    getNoteWitness: (index: number, size?: number) => Promise<Witness<NoteEncrypted, Buffer, Buffer, Buffer> | null>
    hasBlock: (hash: Buffer) => Promise<boolean>
    head: () => Promise<{ hash: Buffer, sequence: number}>
  }
}
