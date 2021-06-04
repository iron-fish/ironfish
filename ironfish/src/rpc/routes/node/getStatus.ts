/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { router, ApiNamespace } from '../router'
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { MathUtils, PromiseUtils } from '../../../utils'

export type GetStatusRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetStatusResponse = {
  node: {
    status: 'started' | 'stopped' | 'error'
  }
  blockchain: {
    synced: boolean
    head: string
  }
  blockSyncer: {
    status: string
    syncing?: {
      blockSpeed: number
      speed: number
    }
  }
  peerNetwork: {
    peers: number
    isReady: boolean
    inboundTraffic: number
    outboundTraffic: number
  }
}

export const GetStatusRequestSchema: yup.ObjectSchema<GetStatusRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .optional()
  .default({})

export const GetStatusResponseSchema: yup.ObjectSchema<GetStatusResponse> = yup
  .object({
    node: yup
      .object({
        status: yup.string().oneOf(['started', 'stopped', 'error']).defined(),
      })
      .defined(),
    blockchain: yup
      .object({
        synced: yup.boolean().defined(),
        head: yup.string().defined(),
      })
      .defined(),
    peerNetwork: yup
      .object({
        peers: yup.number().defined(),
        isReady: yup.boolean().defined(),
        inboundTraffic: yup.number().defined(),
        outboundTraffic: yup.number().defined(),
      })
      .defined(),
    blockSyncer: yup
      .object({
        status: yup.string().oneOf(['started', 'stopped', 'error']).defined(),
        error: yup.string().optional(),
        syncing: yup
          .object({
            blockSpeed: yup.number().defined(),
            speed: yup.number().defined(),
          })
          .optional(),
      })
      .defined(),
  })
  .defined()

router.register<typeof GetStatusRequestSchema, GetStatusResponse>(
  `${ApiNamespace.node}/getStatus`,
  GetStatusRequestSchema,
  async (request, node): Promise<void> => {
    const status = getStatus(node)

    if (!request.data?.stream) {
      request.end(status)
      return
    }

    request.stream(status)

    let stream = true
    while (stream) {
      const status = getStatus(node)
      request.stream(status)
      await PromiseUtils.sleep(500)
    }

    request.onClose.on(() => {
      stream = false
    })
  },
)

function getStatus(node: IronfishNode): GetStatusResponse {
  const peers = node.peerNetwork.peerManager.getConnectedPeers()

  const status: GetStatusResponse = {
    peerNetwork: {
      peers: peers.length,
      isReady: node.peerNetwork.isReady,
      inboundTraffic: Math.max(node.metrics.p2p_InboundTraffic.rate1s, 0),
      outboundTraffic: Math.max(node.metrics.p2p_OutboundTraffic.rate1s, 0),
    },
    blockchain: {
      synced: node.chain.synced,
      head: `${node.chain.head.hash.toString('hex') || ''} (${
        node.chain.head.sequence.toString() || ''
      })`,
    },
    node: {
      status: 'started',
    },
    blockSyncer: {
      status: node.syncer.state,
      syncing: {
        blockSpeed: MathUtils.round(node.chain.addSpeed.avg, 2),
        speed: MathUtils.round(node.syncer.speed.rate1m, 2),
      },
    },
  }

  return status
}
