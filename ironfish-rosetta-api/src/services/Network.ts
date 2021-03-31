/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetChainInfoResponse, ResponseEnded } from 'ironfish'

import { networkIdentifier } from '../config'
import { RequestHandlerParams } from '../middleware/requestHandler'
import { NetworkRequest, NetworkListResponse, NetworkStatusResponse, Peer } from '../types'
import { RPCClient } from '../rpc'
import { isValidNetworkIdentifier } from '../utils/networkIdentifierUtil'

export const NetworkList = async (): Promise<NetworkListResponse> => {
  const response = {
    network_identifiers: [networkIdentifier],
  }

  return Promise.resolve(response)
}

export const NetworkStatus = async (
  requestParams: RequestHandlerParams<NetworkRequest>,
): Promise<NetworkStatusResponse> => {
  const { params } = requestParams
  const { network_identifier: networkIdentifier } = params

  // Verify network identifier
  if (!isValidNetworkIdentifier(networkIdentifier))
    throw new Error(`Network identifier is not valid`)

  const rpc = await RPCClient.init()
  await rpc.sdk.client.connect()

  const chainInfo: ResponseEnded<GetChainInfoResponse> = await rpc.sdk.client.getChainInfo({})

  if (!chainInfo || !chainInfo.content) {
    throw new Error(`Chain info data not found`)
  }

  const peers = await rpc.sdk.client.getPeers()
  const peersResponse: Array<Peer> = []

  if (peers.content.peers && Array.isArray(peers.content.peers)) {
    peers.content.peers.forEach((peer) => {
      if (!peer.identity) return

      peersResponse.push({
        peer_id: peer.identity,
      })
    })
  }

  const response: NetworkStatusResponse = {
    current_block_identifier: {
      index: parseInt(chainInfo.content.currentBlockIdentifier.index),
      hash: chainInfo.content.currentBlockIdentifier.hash,
    },
    current_block_timestamp: chainInfo.content.currentBlockTimestamp,
    genesis_block_identifier: {
      index: parseInt(chainInfo.content.genesisBlockIdentifier.index),
      hash: chainInfo.content.genesisBlockIdentifier.hash,
    },
    oldest_block_identifier: {
      index: parseInt(chainInfo.content.oldestBlockIdentifier.index),
      hash: chainInfo.content.oldestBlockIdentifier.hash,
    },
    peers: peersResponse,
  }

  return response
}
