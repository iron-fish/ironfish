/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { BlockchainUtils } from '../../../utils/blockchain'
import { ApiNamespace, router } from '../router'

export type ExportMinedStreamRequest =
  | {
      start?: number | null
      stop?: number | null
      forks?: boolean | null
    }
  | undefined

export type ExportMinedStreamResponse = {
  start: number
  stop: number
  sequence: number
  block?: {
    hash: string
    minersFee: number
    sequence: number
    main: boolean
    account: string
  }
}

export const ExportMinedStreamRequestSchema: yup.ObjectSchema<ExportMinedStreamRequest> = yup
  .object({
    start: yup.number().nullable().optional(),
    stop: yup.number().nullable().optional(),
    forks: yup.boolean().nullable().optional(),
  })
  .optional()

export const ExportMinedStreamResponseSchema: yup.ObjectSchema<ExportMinedStreamResponse> = yup
  .object({
    start: yup.number().defined(),
    stop: yup.number().defined(),
    sequence: yup.number().defined(),
    block: yup
      .object({
        hash: yup.string().defined(),
        minersFee: yup.number().defined(),
        sequence: yup.number().defined(),
        main: yup.boolean().defined(),
        account: yup.string().defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof ExportMinedStreamRequestSchema, ExportMinedStreamResponse>(
  `${ApiNamespace.miner}/exportMinedStream`,
  ExportMinedStreamRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isNotNull(node.chain.head, 'head')
    Assert.isNotNull(node.chain.latest, 'latest')

    const scanForks = request.data?.forks == null ? false : true

    const { start, stop } = BlockchainUtils.getBlockRange(node.chain, {
      start: request.data?.start,
      stop: request.data?.stop,
    })

    request.stream({ start, stop, sequence: 0 })

    let promise = Promise.resolve()
    let waiting = 0

    for (let i = start; i <= stop; ++i) {
      promise = promise.then(async () => {
        const headers = scanForks
          ? await node.chain.getHeadersAtSequence(i)
          : [await node.chain.getHeaderAtSequence(i)]

        for (const header of headers) {
          if (header == null) {
            break
          }

          const block = await node.chain.getBlock(header)
          Assert.isNotNull(block)

          const account = node.accounts
            .listAccounts()
            .find((a) => BlockchainUtils.isBlockMine(block, a))

          if (!account) {
            request.stream({ start, stop, sequence: header.sequence })
            continue
          }

          const main = await node.chain.isHeadChain(header)
          const minersFee = node.chain.strategy.miningReward(header.sequence)

          const result = {
            main: main,
            hash: header.hash.toString('hex'),
            sequence: header.sequence,
            account: account.name,
            minersFee: minersFee,
          }

          request.stream({ start, stop, sequence: header.sequence, block: result })
        }
      })

      if (++waiting > 100) {
        await promise
        waiting = 0
      }
    }

    await promise

    request.end()
  },
)
