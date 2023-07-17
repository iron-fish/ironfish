import { Transaction } from "../primitives/transaction"

export abstract class WalletNodeClient {
  // abstract(
  //   route: string,
  //   data?: unknown,
  //   options?: { timeoutMs?: number | null },
  // ): RpcResponse<TEnd, TStream>

  abstract mempool = {
    acceptTransaction(transaction: Transaction): void {}
  }

  abstract chain = {
    hasBlock
  }
}
