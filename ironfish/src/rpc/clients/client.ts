/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { RpcResponse, RpcResponseEnded } from '../response'
import type {
  AcceptTransactionRequest,
  AcceptTransactionResponse,
  AddPeerRequest,
  AddPeerResponse,
  AddSignatureRequest,
  AddSignatureResponse,
  AddTransactionRequest,
  AddTransactionResponse,
  AggregateSignatureSharesRequest,
  AggregateSignatureSharesResponse,
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
  CreateParticipantRequest,
  CreateParticipantResponse,
  CreateSignatureShareRequest,
  CreateSignatureShareResponse,
  CreateSigningCommitmentRequest,
  CreateSigningCommitmentResponse,
  CreateSigningPackageRequest,
  CreateSigningPackageResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  CreateTrustedDealerKeyPackageRequest,
  CreateTrustedDealerKeyPackageResponse,
  DecryptWalletRequest,
  DecryptWalletResponse,
  DeleteTransactionRequest,
  DeleteTransactionResponse,
  DkgRound1Request,
  DkgRound1Response,
  DkgRound2Request,
  DkgRound2Response,
  DkgRound3Request,
  DkgRound3Response,
  EncryptWalletRequest,
  EncryptWalletResponse,
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
  GetAccountIdentitiesRequest,
  GetAccountIdentitiesResponse,
  GetAccountIdentityRequest,
  GetAccountIdentityResponse,
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
  GetBlocksRequest,
  GetBlocksResponse,
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
  GetIdentitiesRequest,
  GetIdentitiesResponse,
  GetIdentityRequest,
  GetIdentityResponse,
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
  GetTransactionNotesRequest,
  GetTransactionNotesResponse,
  GetTransactionRequest,
  GetTransactionResponse,
  GetTransactionStreamRequest,
  GetTransactionStreamResponse,
  GetUnsignedTransactionNotesRequest,
  GetUnsignedTransactionNotesResponse,
  GetWalletAssetRequest,
  GetWalletAssetResponse,
  GetWorkersStatusRequest,
  GetWorkersStatusResponse,
  ImportAccountRequest,
  ImportParticipantRequest,
  ImportParticipantResponse,
  ImportResponse,
  IsValidPublicAddressRequest,
  IsValidPublicAddressResponse,
  LockWalletRequest,
  LockWalletResponse,
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
  RescanRequest,
  RescanResponse,
  ResetAccountRequest,
  ResetAccountResponse,
  SendTransactionRequest,
  SendTransactionResponse,
  SetAccountHeadRequest,
  SetAccountHeadResponse,
  SetConfigRequest,
  SetConfigResponse,
  SetScanningRequest,
  SetScanningResponse,
  SignTransactionRequest,
  SignTransactionResponse,
  StopNodeResponse,
  SubmitBlockRequest,
  SubmitBlockResponse,
  UnlockWalletRequest,
  UnlockWalletResponse,
  UnsetConfigRequest,
  UnsetConfigResponse,
  UploadConfigRequest,
  UploadConfigResponse,
  UseAccountRequest,
  UseAccountResponse,
} from '../routes'
import { ApiNamespace } from '../routes/namespaces'

export abstract class RpcClient {
  abstract close(): void

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
    multisig: {
      aggregateSignatureShares: (
        params: AggregateSignatureSharesRequest,
      ): Promise<RpcResponseEnded<AggregateSignatureSharesResponse>> => {
        return this.request<AggregateSignatureSharesResponse>(
          `${ApiNamespace.wallet}/multisig/aggregateSignatureShares`,
          params,
        ).waitForEnd()
      },

      createTrustedDealerKeyPackage: (
        params: CreateTrustedDealerKeyPackageRequest,
      ): Promise<RpcResponseEnded<CreateTrustedDealerKeyPackageResponse>> => {
        return this.request<CreateTrustedDealerKeyPackageResponse>(
          `${ApiNamespace.wallet}/multisig/createTrustedDealerKeyPackage`,
          params,
        ).waitForEnd()
      },

      createSigningPackage: (
        params: CreateSigningPackageRequest,
      ): Promise<RpcResponseEnded<CreateSigningPackageResponse>> => {
        return this.request<CreateSigningPackageResponse>(
          `${ApiNamespace.wallet}/multisig/createSigningPackage`,
          params,
        ).waitForEnd()
      },

      createSigningCommitment: (
        params: CreateSigningCommitmentRequest,
      ): Promise<RpcResponseEnded<CreateSigningCommitmentResponse>> => {
        return this.request<CreateSigningCommitmentResponse>(
          `${ApiNamespace.wallet}/multisig/createSigningCommitment`,
          params,
        ).waitForEnd()
      },

      createSignatureShare: (
        params: CreateSignatureShareRequest,
      ): Promise<RpcResponseEnded<CreateSignatureShareResponse>> => {
        return this.request<CreateSignatureShareResponse>(
          `${ApiNamespace.wallet}/multisig/createSignatureShare`,
          params,
        ).waitForEnd()
      },

      createParticipant: (
        params: CreateParticipantRequest,
      ): Promise<RpcResponseEnded<CreateParticipantResponse>> => {
        return this.request<CreateParticipantResponse>(
          `${ApiNamespace.wallet}/multisig/createParticipant`,
          params,
        ).waitForEnd()
      },

      importParticipant: (
        params: ImportParticipantRequest,
      ): Promise<RpcResponseEnded<ImportParticipantResponse>> => {
        return this.request<ImportParticipantResponse>(
          `${ApiNamespace.wallet}/multisig/importParticipant`,
          params,
        ).waitForEnd()
      },

      getIdentity: (
        params: GetIdentityRequest,
      ): Promise<RpcResponseEnded<GetIdentityResponse>> => {
        return this.request<GetIdentityResponse>(
          `${ApiNamespace.wallet}/multisig/getIdentity`,
          params,
        ).waitForEnd()
      },

      getIdentities: (
        params: GetIdentitiesRequest = undefined,
      ): Promise<RpcResponseEnded<GetIdentitiesResponse>> => {
        return this.request<GetIdentitiesResponse>(
          `${ApiNamespace.wallet}/multisig/getIdentities`,
          params,
        ).waitForEnd()
      },

      getAccountIdentities: (
        params: GetAccountIdentitiesRequest,
      ): Promise<RpcResponseEnded<GetAccountIdentitiesResponse>> => {
        return this.request<GetAccountIdentitiesResponse>(
          `${ApiNamespace.wallet}/multisig/getAccountIdentities`,
          params,
        ).waitForEnd()
      },

      getAccountIdentity: (
        params: GetAccountIdentityRequest,
      ): Promise<RpcResponseEnded<GetAccountIdentityResponse>> => {
        return this.request<GetAccountIdentityResponse>(
          `${ApiNamespace.wallet}/multisig/getAccountIdentity`,
          params,
        ).waitForEnd()
      },

      dkg: {
        round1: (params: DkgRound1Request): Promise<RpcResponseEnded<DkgRound1Response>> => {
          return this.request<DkgRound1Response>(
            `${ApiNamespace.wallet}/multisig/dkg/round1`,
            params,
          ).waitForEnd()
        },

        round2: (params: DkgRound2Request): Promise<RpcResponseEnded<DkgRound2Response>> => {
          return this.request<DkgRound2Response>(
            `${ApiNamespace.wallet}/multisig/dkg/round2`,
            params,
          ).waitForEnd()
        },

        round3: (params: DkgRound3Request): Promise<RpcResponseEnded<DkgRound3Response>> => {
          return this.request<DkgRound3Response>(
            `${ApiNamespace.wallet}/multisig/dkg/round3`,
            params,
          ).waitForEnd()
        },
      },
    },

    setAccountHead: (
      params: SetAccountHeadRequest,
    ): Promise<RpcResponseEnded<SetAccountHeadResponse>> => {
      return this.request<SetAccountHeadResponse>(
        `${ApiNamespace.wallet}/setAccountHead`,
        params,
      ).waitForEnd()
    },

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

    resetAccount: (
      params: ResetAccountRequest,
    ): Promise<RpcResponseEnded<ResetAccountResponse>> => {
      return this.request<ResetAccountResponse>(
        `${ApiNamespace.wallet}/resetAccount`,
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

    rescan: (params: RescanRequest = {}): RpcResponse<void, RescanResponse> => {
      return this.request<void, RescanResponse>(`${ApiNamespace.wallet}/rescan`, params)
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

    getTransactionNotes: (
      params: GetTransactionNotesRequest,
    ): Promise<RpcResponseEnded<GetTransactionNotesResponse>> => {
      return this.request<GetTransactionNotesResponse>(
        `${ApiNamespace.wallet}/getTransactionNotes`,
        params,
      ).waitForEnd()
    },

    getUnsignedTransactionNotes: (
      params: GetUnsignedTransactionNotesRequest,
    ): Promise<RpcResponseEnded<GetUnsignedTransactionNotesResponse>> => {
      return this.request<GetUnsignedTransactionNotesResponse>(
        `${ApiNamespace.wallet}/getUnsignedTransactionNotes`,
        params,
      ).waitForEnd()
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

    addSignature: (
      params: AddSignatureRequest,
    ): Promise<RpcResponseEnded<AddSignatureResponse>> => {
      return this.request<AddSignatureResponse>(
        `${ApiNamespace.wallet}/addSignature`,
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

    signTransaction: (
      params: SignTransactionRequest,
    ): Promise<RpcResponseEnded<SignTransactionResponse>> => {
      return this.request<SignTransactionResponse>(
        `${ApiNamespace.wallet}/signTransaction`,
        params,
      ).waitForEnd()
    },

    deleteTransaction: (
      params: DeleteTransactionRequest,
    ): Promise<RpcResponseEnded<DeleteTransactionResponse>> => {
      return this.request<DeleteTransactionResponse>(
        `${ApiNamespace.wallet}/deleteTransaction`,
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

    setScanning: (
      params: SetScanningRequest,
    ): Promise<RpcResponseEnded<SetScanningResponse>> => {
      return this.request<SetScanningResponse>(
        `${ApiNamespace.wallet}/setScanning`,
        params,
      ).waitForEnd()
    },

    encrypt: (
      params: EncryptWalletRequest,
    ): Promise<RpcResponseEnded<EncryptWalletResponse>> => {
      return this.request<EncryptWalletResponse>(
        `${ApiNamespace.wallet}/encrypt`,
        params,
      ).waitForEnd()
    },

    decrypt: (
      params: DecryptWalletRequest,
    ): Promise<RpcResponseEnded<DecryptWalletResponse>> => {
      return this.request<DecryptWalletResponse>(
        `${ApiNamespace.wallet}/decrypt`,
        params,
      ).waitForEnd()
    },

    unlock: (params: UnlockWalletRequest): Promise<RpcResponseEnded<UnlockWalletResponse>> => {
      return this.request<UnlockWalletResponse>(
        `${ApiNamespace.wallet}/unlock`,
        params,
      ).waitForEnd()
    },

    lock: (params?: LockWalletRequest): Promise<RpcResponseEnded<LockWalletResponse>> => {
      return this.request<LockWalletResponse>(
        `${ApiNamespace.wallet}/lock`,
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

    getBlocks: (params: GetBlocksRequest): Promise<RpcResponseEnded<GetBlocksResponse>> => {
      return this.request<GetBlocksResponse>(
        `${ApiNamespace.chain}/getBlocks`,
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
      params: GetNetworkHashPowerRequest = undefined,
    ): Promise<RpcResponseEnded<GetNetworkHashPowerResponse>> => {
      return this.request<GetNetworkHashPowerResponse>(
        `${ApiNamespace.chain}/getNetworkHashPower`,
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
    ): Promise<RpcResponseEnded<GetTransactionResponse>> => {
      return this.request<GetTransactionResponse>(
        `${ApiNamespace.chain}/getTransaction`,
        params,
      ).waitForEnd()
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
    ): Promise<RpcResponseEnded<IsValidPublicAddressResponse>> => {
      return this.request<IsValidPublicAddressResponse>(
        `${ApiNamespace.chain}/isValidPublicAddress`,
        params,
      ).waitForEnd()
    },

    broadcastTransaction: (
      params: BroadcastTransactionRequest,
    ): Promise<RpcResponseEnded<BroadcastTransactionResponse>> => {
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
}
