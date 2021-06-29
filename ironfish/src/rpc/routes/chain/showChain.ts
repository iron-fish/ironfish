/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { renderChain } from './utils'

export type ShowChainRequest =
  | {
      start?: number | null
      stop?: number | null
    }
  | undefined

export type ShowChainResponse = {
  content: string[]
}

export const ShowChainRequestSchema: yup.ObjectSchema<ShowChainRequest> = yup
  .object({
    start: yup.number().nullable().optional(),
    stop: yup.number().nullable().optional(),
  })
  .optional()

export const ShowChainResponseSchema: yup.ObjectSchema<ShowChainResponse> = yup
  .object({
    content: yup.array(yup.string().defined()).defined(),
  })
  .defined()

/**
 * Render the chain as ani ASCII graph of the block chain
 */
router.register<typeof ShowChainRequestSchema, ShowChainResponse>(
  `${ApiNamespace.chain}/showChain`,
  ShowChainRequestSchema,
  async (request, node): Promise<void> => {
    const content = await renderChain(node.chain, request.data?.start, request.data?.stop, {
      indent: '  ',
      work: false,
    })

    request.end({ content })
  },
)
