/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { Response, ResponseEnded } from '../response'
import {
  ApiNamespace,
  BlockTemplateStreamRequest,
  BlockTemplateStreamResponse,
  CreateAccountRequest,
  CreateAccountResponse,
  GetAccountsRequest,
  GetAccountsResponse,
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

export abstract class IronfishClient {
  readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  abstract request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options?: { timeoutMs?: number | null },
  ): Response<TEnd, TStream>

  async status(
    params: GetStatusRequest = undefined,
  ): Promise<ResponseEnded<GetStatusResponse>> {
    return this.request<GetStatusResponse>(
      `${ApiNamespace.node}/getStatus`,
      params,
    ).waitForEnd()
  }

  statusStream(): Response<void, GetStatusResponse> {
    return this.request<void, GetStatusResponse>(`${ApiNamespace.node}/getStatus`, {
      stream: true,
    })
  }

  async stopNode(): Promise<ResponseEnded<StopNodeResponse>> {
    return this.request<StopNodeResponse>(`${ApiNamespace.node}/stopNode`).waitForEnd()
  }

  getLogStream(): Response<void, GetLogStreamResponse> {
    return this.request<void, GetLogStreamResponse>(`${ApiNamespace.node}/getLogStream`)
  }

  async getAccounts(
    params: GetAccountsRequest = undefined,
  ): Promise<ResponseEnded<GetAccountsResponse>> {
    return await this.request<GetAccountsResponse>(
      `${ApiNamespace.account}/getAccounts`,
      params,
    ).waitForEnd()
  }

  async getDefaultAccount(
    params: GetDefaultAccountRequest = undefined,
  ): Promise<ResponseEnded<GetDefaultAccountResponse>> {
    return await this.request<GetDefaultAccountResponse>(
      `${ApiNamespace.account}/getDefaultAccount`,
      params,
    ).waitForEnd()
  }

  async createAccount(
    params: CreateAccountRequest,
  ): Promise<ResponseEnded<CreateAccountResponse>> {
    return await this.request<CreateAccountResponse>(
      `${ApiNamespace.account}/create`,
      params,
    ).waitForEnd()
  }

  async useAccount(params: UseAccountRequest): Promise<ResponseEnded<UseAccountResponse>> {
    return await this.request<UseAccountResponse>(
      `${ApiNamespace.account}/use`,
      params,
    ).waitForEnd()
  }

  async removeAccount(
    params: RemoveAccountRequest,
  ): Promise<ResponseEnded<RemoveAccountResponse>> {
    return await this.request<RemoveAccountResponse>(
      `${ApiNamespace.account}/remove`,
      params,
    ).waitForEnd()
  }

  async getAccountBalance(
    params: GetBalanceRequest = {},
  ): Promise<ResponseEnded<GetBalanceResponse>> {
    return this.request<GetBalanceResponse>(
      `${ApiNamespace.account}/getBalance`,
      params,
    ).waitForEnd()
  }

  rescanAccountStream(
    params: RescanAccountRequest = {},
  ): Response<void, RescanAccountResponse> {
    return this.request<void, RescanAccountResponse>(
      `${ApiNamespace.account}/rescanAccount`,
      params,
    )
  }

  async exportAccount(
    params: ExportAccountRequest = {},
  ): Promise<ResponseEnded<ExportAccountResponse>> {
    return this.request<ExportAccountResponse>(
      `${ApiNamespace.account}/exportAccount`,
      params,
    ).waitForEnd()
  }

  async importAccount(
    params: ImportAccountRequest,
  ): Promise<ResponseEnded<ImportAccountResponse>> {
    return this.request<ImportAccountResponse>(
      `${ApiNamespace.account}/importAccount`,
      params,
    ).waitForEnd()
  }

  async getAccountPublicKey(
    params: GetPublicKeyRequest,
  ): Promise<ResponseEnded<GetPublicKeyResponse>> {
    return this.request<GetPublicKeyResponse>(
      `${ApiNamespace.account}/getPublicKey`,
      params,
    ).waitForEnd()
  }

  async getPeers(
    params: GetPeersRequest = undefined,
  ): Promise<ResponseEnded<GetPeersResponse>> {
    return this.request<GetPeersResponse>(`${ApiNamespace.peer}/getPeers`, params).waitForEnd()
  }

  getPeersStream(params: GetPeersRequest = undefined): Response<void, GetPeersResponse> {
    return this.request<void, GetPeersResponse>(`${ApiNamespace.peer}/getPeers`, {
      ...params,
      stream: true,
    })
  }

  async getPeer(params: GetPeerRequest): Promise<ResponseEnded<GetPeerResponse>> {
    return this.request<GetPeerResponse>(`${ApiNamespace.peer}/getPeer`, params).waitForEnd()
  }

  getPeerStream(params: GetPeerRequest): Response<void, GetPeerResponse> {
    return this.request<void, GetPeerResponse>(`${ApiNamespace.peer}/getPeer`, {
      ...params,
      stream: true,
    })
  }

  async getPeerMessages(
    params: GetPeerMessagesRequest,
  ): Promise<ResponseEnded<GetPeerMessagesResponse>> {
    return this.request<GetPeerMessagesResponse>(
      `${ApiNamespace.peer}/getPeerMessages`,
      params,
    ).waitForEnd()
  }

  getPeerMessagesStream(
    params: GetPeerMessagesRequest,
  ): Response<void, GetPeerMessagesResponse> {
    return this.request<void, GetPeerMessagesResponse>(`${ApiNamespace.peer}/getPeerMessages`, {
      ...params,
      stream: true,
    })
  }

  async getWorkersStatus(
    params: GetWorkersStatusRequest = undefined,
  ): Promise<ResponseEnded<GetWorkersStatusResponse>> {
    return this.request<GetWorkersStatusResponse>(
      `${ApiNamespace.worker}/getStatus`,
      params,
    ).waitForEnd()
  }

  getWorkersStatusStream(
    params: GetWorkersStatusRequest = undefined,
  ): Response<void, GetWorkersStatusResponse> {
    return this.request<void, GetWorkersStatusResponse>(`${ApiNamespace.worker}/getStatus`, {
      ...params,
      stream: true,
    })
  }

  onGossipStream(params: OnGossipRequest = undefined): Response<void, OnGossipResponse> {
    return this.request<void, OnGossipResponse>(`${ApiNamespace.event}/onGossip`, params)
  }

  async sendTransaction(
    params: SendTransactionRequest,
  ): Promise<ResponseEnded<SendTransactionResponse>> {
    return this.request<SendTransactionResponse>(
      `${ApiNamespace.transaction}/sendTransaction`,
      params,
    ).waitForEnd()
  }

  blockTemplateStream(
    params: BlockTemplateStreamRequest = undefined,
  ): Response<void, BlockTemplateStreamResponse> {
    return this.request<void, BlockTemplateStreamResponse>(
      `${ApiNamespace.miner}/blockTemplateStream`,
      params,
    )
  }

  submitBlock(params: SubmitBlockRequest): Promise<ResponseEnded<SubmitBlockResponse>> {
    return this.request<SubmitBlockResponse>(
      `${ApiNamespace.miner}/submitBlock`,
      params,
    ).waitForEnd()
  }

  exportMinedStream(
    params: ExportMinedStreamRequest = undefined,
  ): Response<void, ExportMinedStreamResponse> {
    return this.request<void, ExportMinedStreamResponse>(
      `${ApiNamespace.miner}/exportMinedStream`,
      params,
    )
  }

  async getFunds(params: GetFundsRequest): Promise<ResponseEnded<GetFundsResponse>> {
    return this.request<GetFundsResponse>(
      `${ApiNamespace.faucet}/getFunds`,
      params,
    ).waitForEnd()
  }

  async getBlock(params: GetBlockRequest): Promise<ResponseEnded<GetBlockResponse>> {
    return this.request<GetBlockResponse>(`${ApiNamespace.chain}/getBlock`, params).waitForEnd()
  }

  async getChainInfo(
    params: GetChainInfoRequest = undefined,
  ): Promise<ResponseEnded<GetChainInfoResponse>> {
    return this.request<GetChainInfoResponse>(
      `${ApiNamespace.chain}/getChainInfo`,
      params,
    ).waitForEnd()
  }

  exportChainStream(
    params: ExportChainStreamRequest = undefined,
  ): Response<void, ExportChainStreamResponse> {
    return this.request<void, ExportChainStreamResponse>(
      `${ApiNamespace.chain}/exportChainStream`,
      params,
    )
  }

  followChainStream(
    params: FollowChainStreamRequest = undefined,
  ): Response<void, FollowChainStreamResponse> {
    return this.request<void, FollowChainStreamResponse>(
      `${ApiNamespace.chain}/followChainStream`,
      params,
    )
  }

  snapshotChainStream(
    params: SnapshotChainStreamRequest = undefined,
  ): Response<void, SnapshotChainStreamResponse> {
    return this.request<void, SnapshotChainStreamResponse>(
      `${ApiNamespace.chain}/snapshotChainStream`,
      params,
    )
  }

  async getBlockInfo(
    params: GetBlockInfoRequest,
  ): Promise<ResponseEnded<GetBlockInfoResponse>> {
    return this.request<GetBlockInfoResponse>(
      `${ApiNamespace.chain}/getBlockInfo`,
      params,
    ).waitForEnd()
  }

  async showChain(
    params: ShowChainRequest = undefined,
  ): Promise<ResponseEnded<ShowChainResponse>> {
    return this.request<ShowChainResponse>(
      `${ApiNamespace.chain}/showChain`,
      params,
    ).waitForEnd()
  }

  getTransactionStream(
    params: GetTransactionStreamRequest,
  ): Response<void, GetTransactionStreamResponse> {
    return this.request<void, GetTransactionStreamResponse>(
      `${ApiNamespace.chain}/getTransactionStream`,
      params,
    )
  }

  async getConfig(
    params: GetConfigRequest = undefined,
  ): Promise<ResponseEnded<GetConfigResponse>> {
    return this.request<GetConfigResponse>(
      `${ApiNamespace.config}/getConfig`,
      params,
    ).waitForEnd()
  }

  async setConfig(params: SetConfigRequest): Promise<ResponseEnded<SetConfigResponse>> {
    return this.request<SetConfigResponse>(
      `${ApiNamespace.config}/setConfig`,
      params,
    ).waitForEnd()
  }

  async uploadConfig(
    params: UploadConfigRequest,
  ): Promise<ResponseEnded<UploadConfigResponse>> {
    return this.request<UploadConfigResponse>(
      `${ApiNamespace.config}/uploadConfig`,
      params,
    ).waitForEnd()
  }
}
