/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { Response, ResponseEnded } from '../response'
import {
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
  GetLogStreamResponse,
  GetPeersRequest,
  GetPeersResponse,
  GetPublicKeyRequest,
  GetPublicKeyResponse,
  GetStatusRequest,
  GetStatusResponse,
  GiveMeRequest,
  GiveMeResponse,
  NewBlocksStreamRequest,
  NewBlocksStreamResponse,
  SendTransactionRequest,
  SendTransactionResponse,
  SetConfigRequest,
  SetConfigResponse,
  ShowChainRequest,
  ShowChainResponse,
  StopNodeResponse,
  SuccessfullyMinedRequest,
  SuccessfullyMinedResponse,
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

export abstract class IronfishRpcClient {
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
    return this.request<GetStatusResponse>('node/getStatus', params).waitForEnd()
  }

  statusStream(): Response<void, GetStatusResponse> {
    return this.request<void, GetStatusResponse>('node/getStatus', { stream: true })
  }

  async stopNode(): Promise<ResponseEnded<StopNodeResponse>> {
    return this.request<StopNodeResponse>('node/stopNode').waitForEnd()
  }

  getLogStream(): Response<void, GetLogStreamResponse> {
    return this.request<void, GetLogStreamResponse>('node/getLogStream')
  }

  async getAccounts(
    params: GetAccountsRequest = undefined,
  ): Promise<ResponseEnded<GetAccountsResponse>> {
    return await this.request<GetAccountsResponse>('account/getAccounts', params).waitForEnd()
  }

  async getDefaultAccount(
    params: GetDefaultAccountRequest = undefined,
  ): Promise<ResponseEnded<GetDefaultAccountResponse>> {
    return await this.request<GetDefaultAccountResponse>(
      'account/getDefaultAccount',
      params,
    ).waitForEnd()
  }

  async createAccount(
    params: CreateAccountRequest,
  ): Promise<ResponseEnded<CreateAccountResponse>> {
    return await this.request<CreateAccountResponse>('account/create', params).waitForEnd()
  }

  async useAccount(params: UseAccountRequest): Promise<ResponseEnded<UseAccountResponse>> {
    return await this.request<UseAccountResponse>('account/use', params).waitForEnd()
  }

  async removeAccount(
    params: RemoveAccountRequest,
  ): Promise<ResponseEnded<RemoveAccountResponse>> {
    return await this.request<RemoveAccountResponse>('account/remove', params).waitForEnd()
  }

  async getAccountBalance(
    params: GetBalanceRequest = {},
  ): Promise<ResponseEnded<GetBalanceResponse>> {
    return this.request<GetBalanceResponse>('account/getBalance', params).waitForEnd()
  }

  rescanAccountStream(
    params: RescanAccountRequest = {},
  ): Response<void, RescanAccountResponse> {
    return this.request<void, RescanAccountResponse>('account/rescanAccount', params)
  }

  async exportAccount(
    params: ExportAccountRequest = {},
  ): Promise<ResponseEnded<ExportAccountResponse>> {
    return this.request<ExportAccountResponse>('account/exportAccount', params).waitForEnd()
  }

  async importAccount(
    params: ImportAccountRequest,
  ): Promise<ResponseEnded<ImportAccountResponse>> {
    return this.request<ImportAccountResponse>('account/importAccount', params).waitForEnd()
  }

  async getAccountPublicKey(
    params: GetPublicKeyRequest,
  ): Promise<ResponseEnded<GetPublicKeyResponse>> {
    return this.request<GetPublicKeyResponse>('account/getPublicKey', params).waitForEnd()
  }

  async getPeers(
    params: GetPeersRequest = undefined,
  ): Promise<ResponseEnded<GetPeersResponse>> {
    return this.request<GetPeersResponse>('peer/getPeers', params).waitForEnd()
  }

  getPeersStream(params: GetPeersRequest = undefined): Response<void, GetPeersResponse> {
    return this.request<void, GetPeersResponse>('peer/getPeers', { ...params, stream: true })
  }

  async getPeer(params: GetPeerRequest): Promise<ResponseEnded<GetPeerResponse>> {
    return this.request<GetPeerResponse>('peer/getPeer', params).waitForEnd()
  }

  getPeerStream(params: GetPeerRequest): Response<void, GetPeerResponse> {
    return this.request<void, GetPeerResponse>('peer/getPeer', { ...params, stream: true })
  }

  async getPeerMessages(
    params: GetPeerMessagesRequest,
  ): Promise<ResponseEnded<GetPeerMessagesResponse>> {
    return this.request<GetPeerMessagesResponse>('peer/getPeerMessages', params).waitForEnd()
  }

  getPeerMessagesStream(
    params: GetPeerMessagesRequest,
  ): Response<void, GetPeerMessagesResponse> {
    return this.request<void, GetPeerMessagesResponse>('peer/getPeerMessages', {
      ...params,
      stream: true,
    })
  }

  onGossipStream(params: OnGossipRequest = undefined): Response<void, OnGossipResponse> {
    return this.request<void, OnGossipResponse>('event/onGossip', params)
  }

  async sendTransaction(
    params: SendTransactionRequest,
  ): Promise<ResponseEnded<SendTransactionResponse>> {
    return this.request<SendTransactionResponse>(
      'transaction/sendTransaction',
      params,
    ).waitForEnd()
  }

  newBlocksStream(
    params: NewBlocksStreamRequest = undefined,
  ): Response<NewBlocksStreamResponse> {
    return this.request<NewBlocksStreamResponse>('miner/newBlocksStream', params)
  }

  successfullyMined(params: SuccessfullyMinedRequest): Response<SuccessfullyMinedResponse> {
    return this.request<SuccessfullyMinedResponse>('miner/successfullyMined', params)
  }

  async giveMeFaucet(params: GiveMeRequest): Promise<ResponseEnded<GiveMeResponse>> {
    return this.request<GiveMeResponse>('faucet/giveMe', params).waitForEnd()
  }

  async getBlock(params: GetBlockRequest): Promise<ResponseEnded<GetBlockResponse>> {
    return this.request<GetBlockResponse>('chain/getBlock', params).waitForEnd()
  }

  async getChainInfo(
    params: GetChainInfoRequest = undefined,
  ): Promise<ResponseEnded<GetChainInfoResponse>> {
    return this.request<GetChainInfoResponse>('chain/getChainInfo', params).waitForEnd()
  }

  exportChainStream(
    params: ExportChainStreamRequest = undefined,
  ): Response<void, ExportChainStreamResponse> {
    return this.request<void, ExportChainStreamResponse>('chain/exportChainStream', params)
  }

  exportMinedStream(
    params: ExportMinedStreamRequest = undefined,
  ): Response<void, ExportMinedStreamResponse> {
    return this.request<void, ExportMinedStreamResponse>('miner/exportMinedStream', params)
  }

  async getBlockInfo(
    params: GetBlockInfoRequest,
  ): Promise<ResponseEnded<GetBlockInfoResponse>> {
    return this.request<GetBlockInfoResponse>('chain/getBlockInfo', params).waitForEnd()
  }

  async showChain(
    params: ShowChainRequest = undefined,
  ): Promise<ResponseEnded<ShowChainResponse>> {
    return this.request<ShowChainResponse>('chain/showChain', params).waitForEnd()
  }

  async getConfig(
    params: GetConfigRequest = undefined,
  ): Promise<ResponseEnded<GetConfigResponse>> {
    return this.request<GetConfigResponse>('config/getConfig', params).waitForEnd()
  }

  async setConfig(params: SetConfigRequest): Promise<ResponseEnded<SetConfigResponse>> {
    return this.request<SetConfigResponse>('config/setConfig', params).waitForEnd()
  }

  async uploadConfig(
    params: UploadConfigRequest,
  ): Promise<ResponseEnded<UploadConfigResponse>> {
    return this.request<UploadConfigResponse>('config/uploadConfig', params).waitForEnd()
  }
}
