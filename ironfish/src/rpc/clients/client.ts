/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { RpcResponse, RpcResponseEnded } from '../response'
import {
  ApiNamespace,
  BlockTemplateStreamRequest,
  BlockTemplateStreamResponse,
  CreateAccountRequest,
  CreateAccountResponse,
  GetAccountNotesRequest,
  GetAccountNotesResponse,
  GetAccountsRequest,
  GetAccountsResponse,
  GetAccountTransactionRequest,
  GetAccountTransactionResponse,
  GetAccountTransactionsRequest,
  GetAccountTransactionsResponse,
  GetBalanceRequest,
  GetBalanceResponse,
  GetBlockInfoRequest,
  GetBlockInfoResponse,
  GetBlockRequest,
  GetBlockResponse,
  GetChainInfoRequest,
  GetChainInfoResponse,
  GetConfigRequest,
  GetConfigResponse,
  GetDefaultAccountRequest,
  GetDefaultAccountResponse,
  GetFundsRequest,
  GetFundsResponse,
  GetLogStreamResponse,
  GetPeersRequest,
  GetPeersResponse,
  GetPublicKeyRequest,
  GetPublicKeyResponse,
  GetStatusRequest,
  GetStatusResponse,
  GetTransactionStreamRequest,
  GetTransactionStreamResponse,
  GetWorkersStatusRequest,
  GetWorkersStatusResponse,
  SendTransactionRequest,
  SendTransactionResponse,
  SetConfigRequest,
  SetConfigResponse,
  ShowChainRequest,
  ShowChainResponse,
  StopNodeResponse,
  SubmitBlockRequest,
  SubmitBlockResponse,
  UploadConfigRequest,
  UploadConfigResponse,
  UseAccountRequest,
  UseAccountResponse,
} from '../routes'
import { ExportAccountRequest, ExportAccountResponse } from '../routes/accounts/exportAccount'
import { ImportAccountRequest, ImportAccountResponse } from '../routes/accounts/importAccount'
import { RemoveAccountRequest, RemoveAccountResponse } from '../routes/accounts/removeAccount'
import { RescanAccountRequest, RescanAccountResponse } from '../routes/accounts/rescanAccount'
import {
  ExportChainStreamRequest,
  ExportChainStreamResponse,
} from '../routes/chain/exportChain'
import {
  FollowChainStreamRequest,
  FollowChainStreamResponse,
} from '../routes/chain/followChain'
import { ImportSnapshotRequest, ImportSnapshotResponse } from '../routes/chain/importChain'
import {
  SnapshotChainStreamRequest,
  SnapshotChainStreamResponse,
} from '../routes/chain/snapshotChain'
import { OnGossipRequest, OnGossipResponse } from '../routes/events/onGossip'
import {
  ExportMinedStreamRequest,
  ExportMinedStreamResponse,
} from '../routes/mining/exportMined'
import { GetPeerRequest, GetPeerResponse } from '../routes/peers/getPeer'
import {
  GetPeerMessagesRequest,
  GetPeerMessagesResponse,
} from '../routes/peers/getPeerMessages'
import { GetRpcStatusRequest, GetRpcStatusResponse } from '../routes/rpc/getStatus'

export abstract class RpcClient {
  readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  abstract request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options?: { timeoutMs?: number | null },
  ): RpcResponse<TEnd, TStream>

  async status(
    params: GetStatusRequest = undefined,
  ): Promise<RpcResponseEnded<GetStatusResponse>> {
    return this.request<GetStatusResponse>(
      `${ApiNamespace.node}/getStatus`,
      params,
    ).waitForEnd()
  }

  statusStream(): RpcResponse<void, GetStatusResponse> {
    return this.request<void, GetStatusResponse>(`${ApiNamespace.node}/getStatus`, {
      stream: true,
    })
  }

  async stopNode(): Promise<RpcResponseEnded<StopNodeResponse>> {
    return this.request<StopNodeResponse>(`${ApiNamespace.node}/stopNode`).waitForEnd()
  }

  getLogStream(): RpcResponse<void, GetLogStreamResponse> {
    return this.request<void, GetLogStreamResponse>(`${ApiNamespace.node}/getLogStream`)
  }

  async getAccounts(
    params: GetAccountsRequest = undefined,
  ): Promise<RpcResponseEnded<GetAccountsResponse>> {
    return await this.request<GetAccountsResponse>(
      `${ApiNamespace.account}/getAccounts`,
      params,
    ).waitForEnd()
  }

  async getDefaultAccount(
    params: GetDefaultAccountRequest = undefined,
  ): Promise<RpcResponseEnded<GetDefaultAccountResponse>> {
    return await this.request<GetDefaultAccountResponse>(
      `${ApiNamespace.account}/getDefaultAccount`,
      params,
    ).waitForEnd()
  }

  async createAccount(
    params: CreateAccountRequest,
  ): Promise<RpcResponseEnded<CreateAccountResponse>> {
    return await this.request<CreateAccountResponse>(
      `${ApiNamespace.account}/create`,
      params,
    ).waitForEnd()
  }

  async useAccount(params: UseAccountRequest): Promise<RpcResponseEnded<UseAccountResponse>> {
    return await this.request<UseAccountResponse>(
      `${ApiNamespace.account}/use`,
      params,
    ).waitForEnd()
  }

  async removeAccount(
    params: RemoveAccountRequest,
  ): Promise<RpcResponseEnded<RemoveAccountResponse>> {
    return await this.request<RemoveAccountResponse>(
      `${ApiNamespace.account}/remove`,
      params,
    ).waitForEnd()
  }

  async getAccountBalance(
    params: GetBalanceRequest = {},
  ): Promise<RpcResponseEnded<GetBalanceResponse>> {
    return this.request<GetBalanceResponse>(
      `${ApiNamespace.account}/getBalance`,
      params,
    ).waitForEnd()
  }

  rescanAccountStream(
    params: RescanAccountRequest = {},
  ): RpcResponse<void, RescanAccountResponse> {
    return this.request<void, RescanAccountResponse>(
      `${ApiNamespace.account}/rescanAccount`,
      params,
    )
  }

  async exportAccount(
    params: ExportAccountRequest = {},
  ): Promise<RpcResponseEnded<ExportAccountResponse>> {
    return this.request<ExportAccountResponse>(
      `${ApiNamespace.account}/exportAccount`,
      params,
    ).waitForEnd()
  }

  async importAccount(
    params: ImportAccountRequest,
  ): Promise<RpcResponseEnded<ImportAccountResponse>> {
    return this.request<ImportAccountResponse>(
      `${ApiNamespace.account}/importAccount`,
      params,
    ).waitForEnd()
  }

  async getAccountPublicKey(
    params: GetPublicKeyRequest,
  ): Promise<RpcResponseEnded<GetPublicKeyResponse>> {
    return this.request<GetPublicKeyResponse>(
      `${ApiNamespace.account}/getPublicKey`,
      params,
    ).waitForEnd()
  }

  async getAccountNotes(
    params: GetAccountNotesRequest = {},
  ): Promise<RpcResponseEnded<GetAccountNotesResponse>> {
    return await this.request<GetAccountNotesResponse>(
      `${ApiNamespace.account}/getAccountNotes`,
      params,
    ).waitForEnd()
  }

  async getAccountTransaction(
    params: GetAccountTransactionRequest,
  ): Promise<RpcResponseEnded<GetAccountTransactionResponse>> {
    return await this.request<GetAccountTransactionResponse>(
      `${ApiNamespace.account}/getAccountTransaction`,
      params,
    ).waitForEnd()
  }

  async getAccountTransactions(
    params: GetAccountTransactionsRequest,
  ): Promise<RpcResponseEnded<GetAccountTransactionsResponse>> {
    return await this.request<GetAccountTransactionsResponse>(
      `${ApiNamespace.account}/getAccountTransactions`,
      params,
    ).waitForEnd()
  }

  async getPeers(
    params: GetPeersRequest = undefined,
  ): Promise<RpcResponseEnded<GetPeersResponse>> {
    return this.request<GetPeersResponse>(`${ApiNamespace.peer}/getPeers`, params).waitForEnd()
  }

  getPeersStream(params: GetPeersRequest = undefined): RpcResponse<void, GetPeersResponse> {
    return this.request<void, GetPeersResponse>(`${ApiNamespace.peer}/getPeers`, {
      ...params,
      stream: true,
    })
  }

  async getPeer(params: GetPeerRequest): Promise<RpcResponseEnded<GetPeerResponse>> {
    return this.request<GetPeerResponse>(`${ApiNamespace.peer}/getPeer`, params).waitForEnd()
  }

  getPeerStream(params: GetPeerRequest): RpcResponse<void, GetPeerResponse> {
    return this.request<void, GetPeerResponse>(`${ApiNamespace.peer}/getPeer`, {
      ...params,
      stream: true,
    })
  }

  async getPeerMessages(
    params: GetPeerMessagesRequest,
  ): Promise<RpcResponseEnded<GetPeerMessagesResponse>> {
    return this.request<GetPeerMessagesResponse>(
      `${ApiNamespace.peer}/getPeerMessages`,
      params,
    ).waitForEnd()
  }

  getPeerMessagesStream(
    params: GetPeerMessagesRequest,
  ): RpcResponse<void, GetPeerMessagesResponse> {
    return this.request<void, GetPeerMessagesResponse>(`${ApiNamespace.peer}/getPeerMessages`, {
      ...params,
      stream: true,
    })
  }

  async getWorkersStatus(
    params: GetWorkersStatusRequest = undefined,
  ): Promise<RpcResponseEnded<GetWorkersStatusResponse>> {
    return this.request<GetWorkersStatusResponse>(
      `${ApiNamespace.worker}/getStatus`,
      params,
    ).waitForEnd()
  }

  getWorkersStatusStream(
    params: GetWorkersStatusRequest = undefined,
  ): RpcResponse<void, GetWorkersStatusResponse> {
    return this.request<void, GetWorkersStatusResponse>(`${ApiNamespace.worker}/getStatus`, {
      ...params,
      stream: true,
    })
  }

  async getRpcStatus(
    params: GetRpcStatusRequest = undefined,
  ): Promise<RpcResponseEnded<GetRpcStatusResponse>> {
    return this.request<GetRpcStatusResponse>(
      `${ApiNamespace.rpc}/getStatus`,
      params,
    ).waitForEnd()
  }

  getRpcStatusStream(
    params: GetRpcStatusRequest = undefined,
  ): RpcResponse<void, GetRpcStatusResponse> {
    return this.request<void, GetRpcStatusResponse>(`${ApiNamespace.rpc}/getStatus`, {
      ...params,
      stream: true,
    })
  }

  onGossipStream(params: OnGossipRequest = undefined): RpcResponse<void, OnGossipResponse> {
    return this.request<void, OnGossipResponse>(`${ApiNamespace.event}/onGossip`, params)
  }

  async sendTransaction(
    params: SendTransactionRequest,
  ): Promise<RpcResponseEnded<SendTransactionResponse>> {
    return this.request<SendTransactionResponse>(
      `${ApiNamespace.transaction}/sendTransaction`,
      params,
    ).waitForEnd()
  }

  blockTemplateStream(
    params: BlockTemplateStreamRequest = undefined,
  ): RpcResponse<void, BlockTemplateStreamResponse> {
    return this.request<void, BlockTemplateStreamResponse>(
      `${ApiNamespace.miner}/blockTemplateStream`,
      params,
    )
  }

  submitBlock(params: SubmitBlockRequest): Promise<RpcResponseEnded<SubmitBlockResponse>> {
    return this.request<SubmitBlockResponse>(
      `${ApiNamespace.miner}/submitBlock`,
      params,
    ).waitForEnd()
  }

  exportMinedStream(
    params: ExportMinedStreamRequest = undefined,
  ): RpcResponse<void, ExportMinedStreamResponse> {
    return this.request<void, ExportMinedStreamResponse>(
      `${ApiNamespace.miner}/exportMinedStream`,
      params,
    )
  }

  async getFunds(params: GetFundsRequest): Promise<RpcResponseEnded<GetFundsResponse>> {
    return this.request<GetFundsResponse>(
      `${ApiNamespace.faucet}/getFunds`,
      params,
    ).waitForEnd()
  }

  async getBlock(params: GetBlockRequest): Promise<RpcResponseEnded<GetBlockResponse>> {
    return this.request<GetBlockResponse>(`${ApiNamespace.chain}/getBlock`, params).waitForEnd()
  }

  async getChainInfo(
    params: GetChainInfoRequest = undefined,
  ): Promise<RpcResponseEnded<GetChainInfoResponse>> {
    return this.request<GetChainInfoResponse>(
      `${ApiNamespace.chain}/getChainInfo`,
      params,
    ).waitForEnd()
  }

  exportChainStream(
    params: ExportChainStreamRequest = undefined,
  ): RpcResponse<void, ExportChainStreamResponse> {
    return this.request<void, ExportChainStreamResponse>(
      `${ApiNamespace.chain}/exportChainStream`,
      params,
    )
  }

  followChainStream(
    params: FollowChainStreamRequest = undefined,
  ): RpcResponse<void, FollowChainStreamResponse> {
    return this.request<void, FollowChainStreamResponse>(
      `${ApiNamespace.chain}/followChainStream`,
      params,
    )
  }

  snapshotChainStream(
    params: SnapshotChainStreamRequest = undefined,
  ): RpcResponse<void, SnapshotChainStreamResponse> {
    return this.request<void, SnapshotChainStreamResponse>(
      `${ApiNamespace.chain}/snapshotChainStream`,
      params,
    )
  }

  importSnapshot(
    params: ImportSnapshotRequest = undefined,
  ): Promise<RpcResponseEnded<ImportSnapshotResponse>> {
    return this.request<ImportSnapshotResponse>(
      `${ApiNamespace.chain}/importSnapshot`,
      params,
    ).waitForEnd()
  }

  async getBlockInfo(
    params: GetBlockInfoRequest,
  ): Promise<RpcResponseEnded<GetBlockInfoResponse>> {
    return this.request<GetBlockInfoResponse>(
      `${ApiNamespace.chain}/getBlockInfo`,
      params,
    ).waitForEnd()
  }

  async showChain(
    params: ShowChainRequest = undefined,
  ): Promise<RpcResponseEnded<ShowChainResponse>> {
    return this.request<ShowChainResponse>(
      `${ApiNamespace.chain}/showChain`,
      params,
    ).waitForEnd()
  }

  getTransactionStream(
    params: GetTransactionStreamRequest,
  ): RpcResponse<void, GetTransactionStreamResponse> {
    return this.request<void, GetTransactionStreamResponse>(
      `${ApiNamespace.chain}/getTransactionStream`,
      params,
    )
  }

  async getConfig(
    params: GetConfigRequest = undefined,
  ): Promise<RpcResponseEnded<GetConfigResponse>> {
    return this.request<GetConfigResponse>(
      `${ApiNamespace.config}/getConfig`,
      params,
    ).waitForEnd()
  }

  async setConfig(params: SetConfigRequest): Promise<RpcResponseEnded<SetConfigResponse>> {
    return this.request<SetConfigResponse>(
      `${ApiNamespace.config}/setConfig`,
      params,
    ).waitForEnd()
  }

  async uploadConfig(
    params: UploadConfigRequest,
  ): Promise<RpcResponseEnded<UploadConfigResponse>> {
    return this.request<UploadConfigResponse>(
      `${ApiNamespace.config}/uploadConfig`,
      params,
    ).waitForEnd()
  }
}
