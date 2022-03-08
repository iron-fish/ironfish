/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { MathUtils, PromiseUtils } from '../../../utils'
import { ApiNamespace, router } from '../router'

export type GetStatusRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetStatusResponse = {
  node: {
    status: 'started' | 'stopped' | 'error'
    version: string
    git: string
  }
  memory: {
    heapTotal: number
    heapUsed: number
    rss: number
    memFree: number
    memTotal: number
  }
  miningDirector: {
    status: 'started'
    miners: number
    blocks: number
  }
  memPool: {
    size: number
  }
  blockchain: {
    synced: boolean
    head: string
  }
  blockSyncer: {
    status: 'stopped' | 'idle' | 'stopping' | 'syncing'
    syncing?: {
      blockSpeed: number
      speed: number
      progress: number
    }
  }
  peerNetwork: {
    peers: number
    isReady: boolean
    inboundTraffic: number
    outboundTraffic: number
  }
  telemetry: {
    status: 'started' | 'stopped'
    pending: number
    submitted: number
  }
  workers: {
    started: boolean
    workers: number
    queued: number
    capacity: number
    executing: number
    change: number
    speed: number
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
        version: yup.string().defined(),
        git: yup.string().defined(),
      })
      .defined(),
    memory: yup
      .object({
        heapTotal: yup.number().defined(),
        heapUsed: yup.number().defined(),
        rss: yup.number().defined(),
        memFree: yup.number().defined(),
        memTotal: yup.number().defined(),
      })
      .defined(),
    miningDirector: yup
      .object({
        status: yup.string().oneOf(['started']).defined(),
        miners: yup.number().defined(),
        blocks: yup.number().defined(),
      })
      .defined(),
    memPool: yup
      .object({
        size: yup.number().defined(),
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
        status: yup.string().oneOf(['stopped', 'idle', 'stopping', 'syncing']).defined(),
        error: yup.string().optional(),
        syncing: yup
          .object({
            blockSpeed: yup.number().defined(),
            speed: yup.number().defined(),
            progress: yup.number().defined(),
          })
          .optional(),
      })
      .defined(),
    telemetry: yup
      .object({
        status: yup.string().oneOf(['started', 'stopped']).defined(),
        pending: yup.number().defined(),
        submitted: yup.number().defined(),
      })
      .defined(),
    workers: yup
      .object({
        started: yup.boolean().defined(),
        workers: yup.number().defined(),
        capacity: yup.number().defined(),
        queued: yup.number().defined(),
        executing: yup.number().defined(),
        change: yup.number().defined(),
        speed: yup.number().defined(),
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
      peers: node.metrics.p2p_PeersCount.value,
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
      status: node.started ? 'started' : 'stopped',
      version: node.pkg.version,
      git: node.pkg.git,
    },
    memory: {
      heapTotal: node.metrics.heapTotal.value,
      heapUsed: node.metrics.heapUsed.value,
      rss: node.metrics.rss.value,
      memFree: node.metrics.memFree.value,
      memTotal: node.metrics.memTotal,
    },
    miningDirector: {
      status: 'started',
      miners: node.miningManager.minersConnected,
      blocks: node.miningManager.blocksMined,
    },
    memPool: {
      size: node.metrics.memPoolSize.value,
    },
    blockSyncer: {
      status: node.syncer.state,
      syncing: {
        blockSpeed: MathUtils.round(node.chain.addSpeed.avg, 2),
        speed: MathUtils.round(node.syncer.speed.rate1m, 2),
        progress: node.chain.getProgress(),
      },
    },
    telemetry: {
      status: node.telemetry.isStarted() ? 'started' : 'stopped',
      pending: node.telemetry.pending,
      submitted: node.telemetry.submitted,
    },
    workers: {
      started: node.workerPool.started,
      workers: node.workerPool.workers.length,
      executing: node.workerPool.executing,
      queued: node.workerPool.queued,
      capacity: node.workerPool.capacity,
      change: MathUtils.round(node.workerPool.change?.rate5s ?? 0, 2),
      speed: MathUtils.round(node.workerPool.speed?.rate5s ?? 0, 2),
    },
  }

  return status
}
