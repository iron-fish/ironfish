/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { SyncerState } from '../../../syncer'
import { MathUtils, PromiseUtils } from '../../../utils'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type GetNodeStatusRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetNodeStatusResponse = {
  node: {
    status: 'started' | 'stopped' | 'error'
    version: string
    git: string
    nodeName: string
    networkId: number
  }
  cpu: {
    cores: number
    percentRollingAvg: number
    percentCurrent: number
  }
  memory: {
    heapMax: number
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
    blockGraffiti: string
    newEmptyBlockTemplateSpeed: number
    newBlockTemplateSpeed: number
    newBlockTransactionsSpeed: number
  }
  memPool: {
    size: number
    sizeBytes: number
    maxSizeBytes: number
    evictions: number
    recentlyEvictedCache: {
      size: number
      maxSize: number
    }
  }
  blockchain: {
    synced: boolean
    head: {
      hash: string
      sequence: number
    }
    headTimestamp: number
    newBlockSpeed: number
    dbSizeBytes: number
  }
  blockSyncer: {
    status: SyncerState
    syncing?: {
      blockSpeed: number
      speed: number
      downloadSpeed: number
      progress: number
    }
  }
  peerNetwork: {
    peers: number
    isReady: boolean
    inboundTraffic: number
    outboundTraffic: number
    publicIdentity: string
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
  accounts: {
    enabled: boolean
    locked: boolean
    scanning?: {
      hash: string
      sequence: number
      startSequence: number
      endSequence: number
      startedAt: number
      speed: number
    }
    head: {
      hash: string
      sequence: number
    }
  }
}

export const GetStatusRequestSchema: yup.ObjectSchema<GetNodeStatusRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .optional()
  .default({})

export const GetStatusResponseSchema: yup.ObjectSchema<GetNodeStatusResponse> = yup
  .object({
    node: yup
      .object({
        status: yup.string().oneOf(['started', 'stopped', 'error']).defined(),
        version: yup.string().defined(),
        git: yup.string().defined(),
        nodeName: yup.string().defined(),
        networkId: yup.number().defined(),
      })
      .defined(),
    cpu: yup
      .object({
        cores: yup.number().defined(),
        percentRollingAvg: yup.number().defined(),
        percentCurrent: yup.number().defined(),
      })
      .defined(),
    memory: yup
      .object({
        heapMax: yup.number().defined(),
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
        blockGraffiti: yup.string().defined(),
        newEmptyBlockTemplateSpeed: yup.number().defined(),
        newBlockTemplateSpeed: yup.number().defined(),
        newBlockTransactionsSpeed: yup.number().defined(),
      })
      .defined(),
    memPool: yup
      .object({
        size: yup.number().defined(),
        sizeBytes: yup.number().defined(),
        maxSizeBytes: yup.number().defined(),
        evictions: yup.number().defined(),
        recentlyEvictedCache: yup
          .object({
            size: yup.number().defined(),
            maxSize: yup.number().defined(),
          })
          .defined(),
      })
      .defined(),
    blockchain: yup
      .object({
        synced: yup.boolean().defined(),
        head: yup
          .object({
            hash: yup.string().defined(),
            sequence: yup.number().defined(),
          })
          .defined(),
        headTimestamp: yup.number().defined(),
        newBlockSpeed: yup.number().defined(),
        dbSizeBytes: yup.number().defined(),
      })
      .defined(),
    peerNetwork: yup
      .object({
        peers: yup.number().defined(),
        isReady: yup.boolean().defined(),
        inboundTraffic: yup.number().defined(),
        outboundTraffic: yup.number().defined(),
        publicIdentity: yup.string().defined(),
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
            downloadSpeed: yup.number().defined(),
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
    accounts: yup
      .object({
        head: yup
          .object({
            hash: yup.string().defined(),
            sequence: yup.number().defined(),
          })
          .defined(),
        enabled: yup.boolean().defined(),
        locked: yup.boolean().defined(),
        scanning: yup
          .object({
            hash: yup.string().defined(),
            sequence: yup.number().defined(),
            startSequence: yup.number().defined(),
            endSequence: yup.number().defined(),
            startedAt: yup.number().defined(),
            speed: yup.number().defined(),
          })
          .optional(),
      })
      .defined(),
  })
  .defined()

routes.register<typeof GetStatusRequestSchema, GetNodeStatusResponse>(
  `${ApiNamespace.node}/getStatus`,
  GetStatusRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const status = getStatus(node)

    if (!request.data?.stream) {
      request.end(await status)
      return
    }

    request.stream(await status)

    let stream = true
    while (stream) {
      const status = await getStatus(node)
      request.stream(status)
      await PromiseUtils.sleep(500)
    }

    request.onClose.on(() => {
      stream = false
    })
  },
)

async function getStatus(node: FullNode): Promise<GetNodeStatusResponse> {
  const walletScanner = node.wallet.scanner.state
  const walletHead = await node.wallet.getLatestHead()
  const chainDBSizeBytes = await node.chain.blockchainDb.size()

  const status: GetNodeStatusResponse = {
    peerNetwork: {
      peers: node.metrics.p2p_PeersCount.value,
      isReady: node.peerNetwork.isReady,
      inboundTraffic: Math.max(node.metrics.p2p_InboundTraffic.rate1s, 0),
      outboundTraffic: Math.max(node.metrics.p2p_OutboundTraffic.rate1s, 0),
      publicIdentity: node.peerNetwork.localPeer.publicIdentity,
    },
    blockchain: {
      synced: node.chain.synced,
      head: {
        hash: node.chain.head.hash.toString('hex'),
        sequence: node.chain.head.sequence,
      },
      headTimestamp: node.chain.head.timestamp.getTime(),
      newBlockSpeed: node.metrics.chain_newBlock.avg,
      dbSizeBytes: chainDBSizeBytes,
    },
    node: {
      status: node.started ? 'started' : 'stopped',
      version: node.pkg.version,
      git: node.pkg.git,
      nodeName: node.config.get('nodeName'),
      networkId: node.internal.get('networkId'),
    },
    cpu: {
      cores: node.metrics.cpuCores,
      percentRollingAvg: node.metrics.cpuMeter.rollingAverage,
      percentCurrent: node.metrics.cpuMeter.current,
    },
    memory: {
      heapMax: node.metrics.heapMax,
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
      blockGraffiti: node.config.get('blockGraffiti'),
      newEmptyBlockTemplateSpeed: node.metrics.mining_newEmptyBlockTemplate.avg,
      newBlockTemplateSpeed: node.metrics.mining_newBlockTemplate.avg,
      newBlockTransactionsSpeed: node.metrics.mining_newBlockTransactions.avg,
    },
    memPool: {
      size: node.metrics.memPoolSize.value,
      sizeBytes: node.memPool.sizeBytes(),
      maxSizeBytes: node.memPool.maxSizeBytes,
      evictions: Math.max(node.metrics.memPoolEvictions.value, 0),
      recentlyEvictedCache: {
        size: node.memPool.recentlyEvictedCacheStats().size,
        maxSize: node.memPool.recentlyEvictedCacheStats().maxSize,
      },
    },
    blockSyncer: {
      status: node.syncer.state,
      syncing: {
        blockSpeed: MathUtils.round(node.chain.addSpeed.average, 2),
        speed: MathUtils.round(node.syncer.speed.rollingRate1m, 2),
        downloadSpeed: MathUtils.round(node.syncer.downloadSpeed.average, 2),
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
    accounts: {
      enabled: node.config.get('enableWallet'),
      locked: node.wallet.locked,
      head: {
        hash: walletHead?.hash.toString('hex') ?? '',
        sequence: walletHead?.sequence ?? -1,
      },
      scanning: walletScanner
        ? {
            sequence: walletScanner.sequence ?? -1,
            hash: walletScanner?.hash?.toString('hex') ?? '',
            startSequence: walletScanner.start.sequence,
            endSequence: walletScanner.end.sequence,
            startedAt: walletScanner.startedAt,
            speed: walletScanner.speed.rate5m,
          }
        : undefined,
    },
  }

  return status
}
