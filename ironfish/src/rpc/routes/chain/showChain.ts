/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
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
routes.register<typeof ShowChainRequestSchema, ShowChainResponse>(
  `${ApiNamespace.chain}/showChain`,
  ShowChainRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    const content = await renderChain(context.chain, request.data?.start, request.data?.stop, {
      indent: '  ',
      work: false,
    })

    request.end({ content })
  },
)
