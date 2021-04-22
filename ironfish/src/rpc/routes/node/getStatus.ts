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
    error?: string
    syncing?: {
      blockSpeed: number
      speed: number
    }
  }
  peerNetwork: {
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
  const status: GetStatusResponse = {
    peerNetwork: {
      isReady: false,
      inboundTraffic: 0,
      outboundTraffic: 0,
    },
    blockchain: {
      synced: node.chain.synced,
      head: `${node.chain.head?.hash.toString('hex') || ''} (${
        node.chain.head?.sequence.toString() || ''
      })`,
    },
    node: {
      status: 'started',
    },
    blockSyncer: {
      status: node.syncer.state.type,
      error: undefined,
    },
  }

  status.peerNetwork.isReady = node.peerNetwork.isReady
  status.peerNetwork.inboundTraffic = node.metrics.p2p_InboundTraffic.rate5s
  status.peerNetwork.outboundTraffic = node.metrics.p2p_OutboundTraffic.rate5s

  status.blockSyncer.syncing = {
    blockSpeed: MathUtils.round(node.syncer.status.blockAddingSpeed.avg, 2),
    speed: MathUtils.round(node.syncer.status.speed.rate1m, 2),
  }

  return status
}
