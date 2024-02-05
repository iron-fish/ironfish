/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { RpcResponse, RpcResponseEnded } from '../response'
import type {
  AcceptTransactionRequest,
  AcceptTransactionResponse,
  AddPeerRequest,
  AddPeerResponse,
  AddTransactionRequest,
  AddTransactionResponse,
  AggregateSigningSharesRequest,
  AggregateSigningSharesResponse,
  BlockTemplateStreamRequest,
  BlockTemplateStreamResponse,
  BroadcastTransactionRequest,
  BroadcastTransactionResponse,
  BuildTransactionRequest,
  BuildTransactionResponse,
  BurnAssetRequest,
  BurnAssetResponse,
  CreateAccountRequest,
  CreateAccountResponse,
  CreateSigningCommitmentRequest,
  CreateSigningCommitmentResponse,
  CreateSigningPackageRequest,
  CreateSigningPackageResponse,
  CreateSigningShareRequest,
  CreateSigningShareResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  CreateTrustedDealerKeyPackageRequest,
  CreateTrustedDealerKeyPackageResponse,
  EstimateFeeRateRequest,
  EstimateFeeRateResponse,
  EstimateFeeRatesRequest,
  EstimateFeeRatesResponse,
  ExportAccountRequest,
  ExportAccountResponse,
  ExportChainStreamRequest,
  ExportChainStreamResponse,
  FollowChainStreamRequest,
  FollowChainStreamResponse,
  GetAccountNotesStreamRequest,
  GetAccountNotesStreamResponse,
  GetAccountsRequest,
  GetAccountsResponse,
  GetAccountsStatusRequest,
  GetAccountsStatusResponse,
  GetAccountStatusRequest,
  GetAccountStatusResponse,
  GetAccountTransactionRequest,
  GetAccountTransactionResponse,
  GetAccountTransactionsRequest,
  GetAccountTransactionsResponse,
  GetAssetRequest,
  GetAssetResponse,
  GetAssetsRequest,
  GetAssetsResponse,
  GetBalanceRequest,
  GetBalanceResponse,
  GetBalancesRequest,
  GetBalancesResponse,
  GetBannedPeersRequest,
  GetBannedPeersResponse,
  GetBlockRequest,
  GetBlockResponse,
  GetChainInfoRequest,
  GetChainInfoResponse,
  GetConfigRequest,
  GetConfigResponse,
  GetConsensusParametersRequest,
  GetConsensusParametersResponse,
  GetDefaultAccountRequest,
  GetDefaultAccountResponse,
  GetDifficultyRequest,
  GetDifficultyResponse,
  GetFundsRequest,
  GetFundsResponse,
  GetLogStreamResponse,
  GetMempoolStatusResponse,
  GetMempoolTransactionResponse,
  GetMempoolTransactionsRequest,
  GetNetworkHashPowerRequest,
  GetNetworkHashPowerResponse,
  GetNetworkInfoRequest,
  GetNetworkInfoResponse,
  GetNodeStatusRequest,
  GetNodeStatusResponse,
  GetNotesRequest,
  GetNotesResponse,
  GetNoteWitnessRequest,
  GetNoteWitnessResponse,
  GetPeerMessagesRequest,
  GetPeerMessagesResponse,
  GetPeerRequest,
  GetPeerResponse,
  GetPeersRequest,
  GetPeersResponse,
  GetPublicKeyRequest,
  GetPublicKeyResponse,
  GetRpcStatusRequest,
  GetRpcStatusResponse,
  GetTransactionRequest,
  GetTransactionResponse,
  GetTransactionStreamRequest,
  GetTransactionStreamResponse,
  GetWalletAssetRequest,
  GetWalletAssetResponse,
  GetWorkersStatusRequest,
  GetWorkersStatusResponse,
  ImportAccountRequest,
  ImportResponse,
  IsValidPublicAddressRequest,
  IsValidPublicAddressResponse,
  MintAssetRequest,
  MintAssetResponse,
  OnGossipRequest,
  OnGossipResponse,
  OnReorganizeChainRequest,
  OnReorganizeChainResponse,
  OnTransactionGossipRequest,
  OnTransactionGossipResponse,
  PostTransactionRequest,
  PostTransactionResponse,
  RemoveAccountRequest,
  RemoveAccountResponse,
  RenameAccountRequest,
  RenameAccountResponse,
  RescanAccountRequest,
  RescanAccountResponse,
  SendTransactionRequest,
  SendTransactionResponse,
  SetConfigRequest,
  SetConfigResponse,
  ShowChainRequest,
  ShowChainResponse,
  StopNodeResponse,
  SubmitBlockRequest,
  SubmitBlockResponse,
  UnsetConfigRequest,
  UnsetConfigResponse,
  UploadConfigRequest,
  UploadConfigResponse,
  UseAccountRequest,
  UseAccountResponse,
} from '../routes'
import { ApiNamespace } from '../routes/namespaces'

export abstract class RpcClient {
  abstract request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options?: { timeoutMs?: number | null },
  ): RpcResponse<TEnd, TStream>

  node = {
    getStatus: (
      params: GetNodeStatusRequest = undefined,
    ): Promise<RpcResponseEnded<GetNodeStatusResponse>> => {
      return this.request<GetNodeStatusResponse>(
        `${ApiNamespace.node}/getStatus`,
        params,
      ).waitForEnd()
    },

    getStatusStream: (): RpcResponse<void, GetNodeStatusResponse> => {
      return this.request<void, GetNodeStatusResponse>(`${ApiNamespace.node}/getStatus`, {
        stream: true,
      })
    },

    stopNode: (): Promise<RpcResponseEnded<StopNodeResponse>> => {
      return this.request<StopNodeResponse>(`${ApiNamespace.node}/stopNode`).waitForEnd()
    },

    getLogStream: (): RpcResponse<void, GetLogStreamResponse> => {
      return this.request<void, GetLogStreamResponse>(`${ApiNamespace.node}/getLogStream`)
    },
  }

  wallet = {
    getAccounts: (
      params: GetAccountsRequest = undefined,
    ): Promise<RpcResponseEnded<GetAccountsResponse>> => {
      return this.request<GetAccountsResponse>(
        `${ApiNamespace.wallet}/getAccounts`,
        params,
      ).waitForEnd()
    },

    getDefaultAccount: (
      params: GetDefaultAccountRequest = undefined,
    ): Promise<RpcResponseEnded<GetDefaultAccountResponse>> => {
      return this.request<GetDefaultAccountResponse>(
        `${ApiNamespace.wallet}/getDefaultAccount`,
        params,
      ).waitForEnd()
    },

    createAccount: (
      params: CreateAccountRequest,
    ): Promise<RpcResponseEnded<CreateAccountResponse>> => {
      return this.request<CreateAccountResponse>(
        `${ApiNamespace.wallet}/createAccount`,
        params,
      ).waitForEnd()
    },

    useAccount: (params: UseAccountRequest): Promise<RpcResponseEnded<UseAccountResponse>> => {
      return this.request<UseAccountResponse>(
        `${ApiNamespace.wallet}/useAccount`,
        params,
      ).waitForEnd()
    },

    renameAccount: (
      params: RenameAccountRequest,
    ): Promise<RpcResponseEnded<RenameAccountResponse>> => {
      return this.request<RenameAccountResponse>(
        `${ApiNamespace.wallet}/renameAccount`,
        params,
      ).waitForEnd()
    },

    removeAccount: (
      params: RemoveAccountRequest,
    ): Promise<RpcResponseEnded<RemoveAccountResponse>> => {
      return this.request<RemoveAccountResponse>(
        `${ApiNamespace.wallet}/removeAccount`,
        params,
      ).waitForEnd()
    },

    getAccountBalances: (
      params: GetBalancesRequest,
    ): Promise<RpcResponseEnded<GetBalancesResponse>> => {
      return this.request<GetBalancesResponse>(
        `${ApiNamespace.wallet}/getBalances`,
        params,
      ).waitForEnd()
    },

    getAccountBalance: (
      params?: GetBalanceRequest,
    ): Promise<RpcResponseEnded<GetBalanceResponse>> => {
      return this.request<GetBalanceResponse>(
        `${ApiNamespace.wallet}/getBalance`,
        params,
      ).waitForEnd()
    },

    rescanAccountStream: (
      params: RescanAccountRequest = {},
    ): RpcResponse<void, RescanAccountResponse> => {
      return this.request<void, RescanAccountResponse>(
        `${ApiNamespace.wallet}/rescanAccount`,
        params,
      )
    },

    exportAccount: (
      params: ExportAccountRequest,
    ): Promise<RpcResponseEnded<ExportAccountResponse>> => {
      return this.request<ExportAccountResponse>(
        `${ApiNamespace.wallet}/exportAccount`,
        params,
      ).waitForEnd()
    },

    importAccount: (
      params: ImportAccountRequest,
    ): Promise<RpcResponseEnded<ImportResponse>> => {
      return this.request<ImportResponse>(
        `${ApiNamespace.wallet}/importAccount`,
        params,
      ).waitForEnd()
    },

    getAccountPublicKey: (
      params: GetPublicKeyRequest = {},
    ): Promise<RpcResponseEnded<GetPublicKeyResponse>> => {
      return this.request<GetPublicKeyResponse>(
        `${ApiNamespace.wallet}/getPublicKey`,
        params,
      ).waitForEnd()
    },

    getAccountNotesStream: (
      params: GetAccountNotesStreamRequest = {},
    ): RpcResponse<void, GetAccountNotesStreamResponse> => {
      return this.request<void, GetAccountNotesStreamResponse>(
        `${ApiNamespace.wallet}/getAccountNotesStream`,
        params,
      )
    },

    getAccountStatus: (
      params: GetAccountStatusRequest,
    ): Promise<RpcResponseEnded<GetAccountStatusResponse>> => {
      return this.request<GetAccountStatusResponse>(
        `${ApiNamespace.wallet}/getAccountStatus`,
        params,
      ).waitForEnd()
    },

    getAccountsStatus: (
      params: GetAccountsStatusRequest = {},
    ): Promise<RpcResponseEnded<GetAccountsStatusResponse>> => {
      return this.request<GetAccountsStatusResponse>(
        `${ApiNamespace.wallet}/getAccountsStatus`,
        params,
      ).waitForEnd()
    },

    getAccountTransaction: (
      params: GetAccountTransactionRequest,
    ): Promise<RpcResponseEnded<GetAccountTransactionResponse>> => {
      return this.request<GetAccountTransactionResponse>(
        `${ApiNamespace.wallet}/getAccountTransaction`,
        params,
      ).waitForEnd()
    },

    getAccountTransactionsStream: (
      params: GetAccountTransactionsRequest,
    ): RpcResponse<void, GetAccountTransactionsResponse> => {
      return this.request<void, GetAccountTransactionsResponse>(
        `${ApiNamespace.wallet}/getAccountTransactions`,
        params,
      )
    },

    getNotes: (params: GetNotesRequest): Promise<RpcResponseEnded<GetNotesResponse>> => {
      return this.request<GetNotesResponse>(
        `${ApiNamespace.wallet}/getNotes`,
        params,
      ).waitForEnd()
    },

    getAsset: (
      params: GetWalletAssetRequest,
    ): Promise<RpcResponseEnded<GetWalletAssetResponse>> => {
      return this.request<GetWalletAssetResponse>(
        `${ApiNamespace.wallet}/getAsset`,
        params,
      ).waitForEnd()
    },

    mintAsset: (params: MintAssetRequest): Promise<RpcResponseEnded<MintAssetResponse>> => {
      return this.request<MintAssetResponse>(
        `${ApiNamespace.wallet}/mintAsset`,
        params,
      ).waitForEnd()
    },

    burnAsset: (params: BurnAssetRequest): Promise<RpcResponseEnded<BurnAssetResponse>> => {
      return this.request<BurnAssetResponse>(
        `${ApiNamespace.wallet}/burnAsset`,
        params,
      ).waitForEnd()
    },

    sendTransaction: (
      params: SendTransactionRequest,
    ): Promise<RpcResponseEnded<SendTransactionResponse>> => {
      return this.request<SendTransactionResponse>(
        `${ApiNamespace.wallet}/sendTransaction`,
        params,
      ).waitForEnd()
    },

    getAssets: (params: GetAssetsRequest): RpcResponse<void, GetAssetsResponse> => {
      return this.request<void, GetAssetsResponse>(`${ApiNamespace.wallet}/getAssets`, params)
    },

    postTransaction: (
      params: PostTransactionRequest,
    ): Promise<RpcResponseEnded<PostTransactionResponse>> => {
      return this.request<PostTransactionResponse>(
        `${ApiNamespace.wallet}/postTransaction`,
        params,
      ).waitForEnd()
    },

    addTransaction: (
      params: AddTransactionRequest,
    ): Promise<RpcResponseEnded<AddTransactionResponse>> => {
      return this.request<AddTransactionResponse>(
        `${ApiNamespace.wallet}/addTransaction`,
        params,
      ).waitForEnd()
    },

    createTransaction: (
      params: CreateTransactionRequest,
    ): Promise<RpcResponseEnded<CreateTransactionResponse>> => {
      return this.request<CreateTransactionResponse>(
        `${ApiNamespace.wallet}/createTransaction`,
        params,
      ).waitForEnd()
    },

    estimateFeeRates: (
      params?: EstimateFeeRatesRequest,
    ): Promise<RpcResponseEnded<EstimateFeeRatesResponse>> => {
      return this.request<EstimateFeeRatesResponse>(
        `${ApiNamespace.wallet}/estimateFeeRates`,
        params,
      ).waitForEnd()
    },

    getNodeStatus: (
      params: GetNodeStatusRequest = undefined,
    ): Promise<RpcResponseEnded<GetNodeStatusResponse>> => {
      return this.request<GetNodeStatusResponse>(
        `${ApiNamespace.wallet}/getNodeStatus`,
        params,
      ).waitForEnd()
    },

    getNodeStatusStream: (): RpcResponse<void, GetNodeStatusResponse> => {
      return this.request<void, GetNodeStatusResponse>(`${ApiNamespace.wallet}/getNodeStatus`, {
        stream: true,
      })
    },

    buildTransaction: (
      params: BuildTransactionRequest,
    ): Promise<RpcResponseEnded<BuildTransactionResponse>> => {
      return this.request<BuildTransactionResponse>(
        `${ApiNamespace.wallet}/buildTransaction`,
        params,
      ).waitForEnd()
    },
  }

  mempool = {
    acceptTransaction: (
      params: AcceptTransactionRequest,
    ): Promise<RpcResponseEnded<AcceptTransactionResponse>> => {
      return this.request<AcceptTransactionResponse>(
        `${ApiNamespace.mempool}/acceptTransaction`,
        params,
      ).waitForEnd()
    },

    getMempoolTransactionsStream: (
      params: GetMempoolTransactionsRequest,
    ): RpcResponse<void, GetMempoolTransactionResponse> => {
      return this.request<void, GetMempoolTransactionResponse>(
        `${ApiNamespace.mempool}/getTransactions`,
        { ...params },
      )
    },

    getMempoolStatus: (): Promise<RpcResponseEnded<GetMempoolStatusResponse>> => {
      return this.request<GetMempoolStatusResponse>(
        `${ApiNamespace.mempool}/getStatus`,
      ).waitForEnd()
    },

    getMempoolStatusStream: (): RpcResponse<void, GetMempoolStatusResponse> => {
      return this.request<void, GetMempoolStatusResponse>(`${ApiNamespace.mempool}/getStatus`, {
        stream: true,
      })
    },
  }

  peer = {
    addPeer: (params: AddPeerRequest): Promise<RpcResponseEnded<AddPeerResponse>> => {
      return this.request<AddPeerResponse>(`${ApiNamespace.peer}/addPeer`, params).waitForEnd()
    },

    getBannedPeers: (
      params: GetBannedPeersRequest = undefined,
    ): Promise<RpcResponseEnded<GetBannedPeersResponse>> => {
      return this.request<GetBannedPeersResponse>(
        `${ApiNamespace.peer}/getBannedPeers`,
        params,
      ).waitForEnd()
    },

    getBannedPeersStream: (
      params: GetBannedPeersRequest = undefined,
    ): RpcResponse<void, GetBannedPeersResponse> => {
      return this.request<void, GetBannedPeersResponse>(`${ApiNamespace.peer}/getBannedPeers`, {
        ...params,
        stream: true,
      })
    },

    getPeers: (
      params: GetPeersRequest = undefined,
    ): Promise<RpcResponseEnded<GetPeersResponse>> => {
      return this.request<GetPeersResponse>(
        `${ApiNamespace.peer}/getPeers`,
        params,
      ).waitForEnd()
    },

    getPeersStream: (
      params: GetPeersRequest = undefined,
    ): RpcResponse<void, GetPeersResponse> => {
      return this.request<void, GetPeersResponse>(`${ApiNamespace.peer}/getPeers`, {
        ...params,
        stream: true,
      })
    },

    getPeer: (params: GetPeerRequest): Promise<RpcResponseEnded<GetPeerResponse>> => {
      return this.request<GetPeerResponse>(`${ApiNamespace.peer}/getPeer`, params).waitForEnd()
    },

    getPeerStream: (params: GetPeerRequest): RpcResponse<void, GetPeerResponse> => {
      return this.request<void, GetPeerResponse>(`${ApiNamespace.peer}/getPeer`, {
        ...params,
        stream: true,
      })
    },

    getPeerMessages: (
      params: GetPeerMessagesRequest,
    ): Promise<RpcResponseEnded<GetPeerMessagesResponse>> => {
      return this.request<GetPeerMessagesResponse>(
        `${ApiNamespace.peer}/getPeerMessages`,
        params,
      ).waitForEnd()
    },

    getPeerMessagesStream: (
      params: GetPeerMessagesRequest,
    ): RpcResponse<void, GetPeerMessagesResponse> => {
      return this.request<void, GetPeerMessagesResponse>(
        `${ApiNamespace.peer}/getPeerMessages`,
        {
          ...params,
          stream: true,
        },
      )
    },
  }

  worker = {
    getWorkersStatus: (
      params: GetWorkersStatusRequest = undefined,
    ): Promise<RpcResponseEnded<GetWorkersStatusResponse>> => {
      return this.request<GetWorkersStatusResponse>(
        `${ApiNamespace.worker}/getStatus`,
        params,
      ).waitForEnd()
    },

    getWorkersStatusStream: (
      params: GetWorkersStatusRequest = undefined,
    ): RpcResponse<void, GetWorkersStatusResponse> => {
      return this.request<void, GetWorkersStatusResponse>(`${ApiNamespace.worker}/getStatus`, {
        ...params,
        stream: true,
      })
    },
  }

  rpc = {
    getRpcStatus: (
      params: GetRpcStatusRequest = undefined,
    ): Promise<RpcResponseEnded<GetRpcStatusResponse>> => {
      return this.request<GetRpcStatusResponse>(
        `${ApiNamespace.rpc}/getStatus`,
        params,
      ).waitForEnd()
    },

    getRpcStatusStream: (
      params: GetRpcStatusRequest = undefined,
    ): RpcResponse<void, GetRpcStatusResponse> => {
      return this.request<void, GetRpcStatusResponse>(`${ApiNamespace.rpc}/getStatus`, {
        ...params,
        stream: true,
      })
    },
  }

  event = {
    onGossipStream: (
      params: OnGossipRequest = undefined,
    ): RpcResponse<void, OnGossipResponse> => {
      return this.request<void, OnGossipResponse>(`${ApiNamespace.event}/onGossip`, params)
    },

    onReorganizeChainStream: (
      params: OnReorganizeChainRequest = undefined,
    ): RpcResponse<void, OnReorganizeChainResponse> => {
      return this.request<void, OnReorganizeChainResponse>(
        `${ApiNamespace.event}/onReorganizeChain`,
        params,
      )
    },

    onTransactionGossipStream: (
      params: OnTransactionGossipRequest = undefined,
    ): RpcResponse<void, OnTransactionGossipResponse> => {
      return this.request<void, OnTransactionGossipResponse>(
        `${ApiNamespace.event}/onTransactionGossip`,
        params,
      )
    },
  }

  miner = {
    blockTemplateStream: (
      params: BlockTemplateStreamRequest = undefined,
    ): RpcResponse<void, BlockTemplateStreamResponse> => {
      return this.request<void, BlockTemplateStreamResponse>(
        `${ApiNamespace.miner}/blockTemplateStream`,
        params,
      )
    },

    submitBlock: (
      params: SubmitBlockRequest,
    ): Promise<RpcResponseEnded<SubmitBlockResponse>> => {
      return this.request<SubmitBlockResponse>(
        `${ApiNamespace.miner}/submitBlock`,
        params,
      ).waitForEnd()
    },
  }

  faucet = {
    getFunds: (params: GetFundsRequest): Promise<RpcResponseEnded<GetFundsResponse>> => {
      return this.request<GetFundsResponse>(
        `${ApiNamespace.faucet}/getFunds`,
        params,
      ).waitForEnd()
    },
  }

  chain = {
    estimateFeeRates: (
      params?: EstimateFeeRatesRequest,
    ): Promise<RpcResponseEnded<EstimateFeeRatesResponse>> => {
      return this.request<EstimateFeeRatesResponse>(
        `${ApiNamespace.chain}/estimateFeeRates`,
        params,
      ).waitForEnd()
    },

    estimateFeeRate: (
      params?: EstimateFeeRateRequest,
    ): Promise<RpcResponseEnded<EstimateFeeRateResponse>> => {
      return this.request<EstimateFeeRateResponse>(
        `${ApiNamespace.chain}/estimateFeeRate`,
        params,
      ).waitForEnd()
    },

    getChainInfo: (
      params: GetChainInfoRequest = undefined,
    ): Promise<RpcResponseEnded<GetChainInfoResponse>> => {
      return this.request<GetChainInfoResponse>(
        `${ApiNamespace.chain}/getChainInfo`,
        params,
      ).waitForEnd()
    },

    exportChainStream: (
      params: ExportChainStreamRequest = undefined,
    ): RpcResponse<void, ExportChainStreamResponse> => {
      return this.request<void, ExportChainStreamResponse>(
        `${ApiNamespace.chain}/exportChainStream`,
        params,
      )
    },

    followChainStream: (
      params: FollowChainStreamRequest = undefined,
    ): RpcResponse<void, FollowChainStreamResponse> => {
      return this.request<void, FollowChainStreamResponse>(
        `${ApiNamespace.chain}/followChainStream`,
        params,
      )
    },

    getBlock: (params: GetBlockRequest): Promise<RpcResponseEnded<GetBlockResponse>> => {
      return this.request<GetBlockResponse>(
        `${ApiNamespace.chain}/getBlock`,
        params,
      ).waitForEnd()
    },

    getDifficulty: (
      params: GetDifficultyRequest = undefined,
    ): Promise<RpcResponseEnded<GetDifficultyResponse>> => {
      return this.request<GetDifficultyResponse>(
        `${ApiNamespace.chain}/getDifficulty`,
        params,
      ).waitForEnd()
    },

    getNoteWitness: (
      params: GetNoteWitnessRequest,
    ): Promise<RpcResponseEnded<GetNoteWitnessResponse>> => {
      return this.request<GetNoteWitnessResponse>(
        `${ApiNamespace.chain}/getNoteWitness`,
        params,
      ).waitForEnd()
    },

    getNetworkHashPower: (
      params: GetNetworkHashPowerRequest,
    ): Promise<RpcResponseEnded<GetNetworkHashPowerResponse>> => {
      return this.request<GetNetworkHashPowerResponse>(
        `${ApiNamespace.chain}/getNetworkHashPower`,
        params,
      ).waitForEnd()
    },

    showChain: (
      params: ShowChainRequest = undefined,
    ): Promise<RpcResponseEnded<ShowChainResponse>> => {
      return this.request<ShowChainResponse>(
        `${ApiNamespace.chain}/showChain`,
        params,
      ).waitForEnd()
    },

    getTransactionStream: (
      params: GetTransactionStreamRequest,
    ): RpcResponse<void, GetTransactionStreamResponse> => {
      return this.request<void, GetTransactionStreamResponse>(
        `${ApiNamespace.chain}/getTransactionStream`,
        params,
      )
    },

    getTransaction: (
      params: GetTransactionRequest,
    ): RpcResponse<void, GetTransactionResponse> => {
      return this.request<void, GetTransactionResponse>(
        `${ApiNamespace.chain}/getTransaction`,
        params,
      )
    },

    getConsensusParameters: (
      params: GetConsensusParametersRequest = undefined,
    ): Promise<RpcResponseEnded<GetConsensusParametersResponse>> => {
      return this.request<GetConsensusParametersResponse>(
        `${ApiNamespace.chain}/getConsensusParameters`,
        params,
      ).waitForEnd()
    },

    getAsset: (params: GetAssetRequest): Promise<RpcResponseEnded<GetAssetResponse>> => {
      return this.request<GetAssetResponse>(
        `${ApiNamespace.chain}/getAsset`,
        params,
      ).waitForEnd()
    },

    getNetworkInfo: (
      params?: GetNetworkInfoRequest,
    ): Promise<RpcResponseEnded<GetNetworkInfoResponse>> => {
      return this.request<GetNetworkInfoResponse>(
        `${ApiNamespace.chain}/getNetworkInfo`,
        params,
      ).waitForEnd()
    },

    isValidPublicAddress: (
      params: IsValidPublicAddressRequest,
    ): Promise<RpcResponse<IsValidPublicAddressResponse>> => {
      return this.request<IsValidPublicAddressResponse>(
        `${ApiNamespace.chain}/isValidPublicAddress`,
        params,
      ).waitForEnd()
    },

    broadcastTransaction: (
      params: BroadcastTransactionRequest,
    ): Promise<RpcResponse<BroadcastTransactionResponse>> => {
      return this.request<BroadcastTransactionResponse>(
        `${ApiNamespace.chain}/broadcastTransaction`,
        params,
      ).waitForEnd()
    },
  }

  config = {
    getConfig: (
      params: GetConfigRequest = undefined,
    ): Promise<RpcResponseEnded<GetConfigResponse>> => {
      return this.request<GetConfigResponse>(
        `${ApiNamespace.config}/getConfig`,
        params,
      ).waitForEnd()
    },

    setConfig: (params: SetConfigRequest): Promise<RpcResponseEnded<SetConfigResponse>> => {
      return this.request<SetConfigResponse>(
        `${ApiNamespace.config}/setConfig`,
        params,
      ).waitForEnd()
    },

    unsetConfig: (
      params: UnsetConfigRequest,
    ): Promise<RpcResponseEnded<UnsetConfigResponse>> => {
      return this.request<UnsetConfigResponse>(
        `${ApiNamespace.config}/unsetConfig`,
        params,
      ).waitForEnd()
    },

    uploadConfig: (
      params: UploadConfigRequest,
    ): Promise<RpcResponseEnded<UploadConfigResponse>> => {
      return this.request<UploadConfigResponse>(
        `${ApiNamespace.config}/uploadConfig`,
        params,
      ).waitForEnd()
    },
  }
  multisig = {
    aggregateSignatureShares: (
      params: AggregateSigningSharesRequest,
    ): Promise<RpcResponseEnded<AggregateSigningSharesResponse>> => {
      return this.request<AggregateSigningSharesResponse>(
        `${ApiNamespace.multisig}/aggregateSignatureShares`,
        params,
      ).waitForEnd()
    },

    createTrustedDealerKeyPackage: (
      params: CreateTrustedDealerKeyPackageRequest,
    ): Promise<RpcResponseEnded<CreateTrustedDealerKeyPackageResponse>> => {
      return this.request<CreateTrustedDealerKeyPackageResponse>(
        `${ApiNamespace.multisig}/createTrustedDealerKeyPackage`,
        params,
      ).waitForEnd()
    },

    createSigningPackage: (
      params: CreateSigningPackageRequest,
    ): Promise<RpcResponseEnded<CreateSigningPackageResponse>> => {
      return this.request<CreateSigningPackageResponse>(
        `${ApiNamespace.multisig}/createSigningPackage`,
        params,
      ).waitForEnd()
    },

    createSigningCommitment: (
      params: CreateSigningCommitmentRequest,
    ): Promise<RpcResponseEnded<CreateSigningCommitmentResponse>> => {
      return this.request<CreateSigningCommitmentResponse>(
        `${ApiNamespace.multisig}/createSigningCommitment`,
        params,
      ).waitForEnd()
    },

    createSigningShare: (
      params: CreateSigningShareRequest,
    ): Promise<RpcResponseEnded<CreateSigningShareResponse>> => {
      return this.request<CreateSigningShareResponse>(
        `${ApiNamespace.multisig}/createSigningShare`,
        params,
      ).waitForEnd()
    },
  }
}
