/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { PromiseUtils } from '../../../utils'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type GetMempoolStatusRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetMempoolStatusResponse = {
  size: number
  sizeBytes: number
  maxSizeBytes: number
  evictions: number
  headSequence: number
  recentlyEvictedCache: {
    size: number
    maxSize: number
  }
}

export const GetMempoolStatusRequestSchema: yup.ObjectSchema<GetMempoolStatusRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .optional()
  .default({})

export const GetMempoolStatusResponseSchema: yup.ObjectSchema<GetMempoolStatusResponse> = yup
  .object({
    size: yup.number().defined(),
    sizeBytes: yup.number().defined(),
    maxSizeBytes: yup.number().defined(),
    evictions: yup.number().defined(),
    headSequence: yup.number().defined(),
    recentlyEvictedCache: yup
      .object({
        size: yup.number().defined(),
        maxSize: yup.number().defined(),
      })
      .defined(),
  })
  .defined()

routes.register<typeof GetMempoolStatusRequestSchema, GetMempoolStatusResponse>(
  `${ApiNamespace.mempool}/getStatus`,
  GetMempoolStatusRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

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

function getStatus(node: FullNode): GetMempoolStatusResponse {
  const { memPool, metrics } = node

  return {
    size: memPool.count(),
    sizeBytes: memPool.sizeBytes(),
    maxSizeBytes: memPool.maxSizeBytes,
    headSequence: memPool.head?.sequence || 0,
    evictions: metrics.memPoolEvictions.value,
    recentlyEvictedCache: memPool.recentlyEvictedCacheStats(),
  }
}
