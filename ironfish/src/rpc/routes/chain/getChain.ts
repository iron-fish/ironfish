/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { printChain } from './utils'

export type GetChainRequest = Record<string, never> | undefined

export type GetChainResponse = {
  content: string[]
}

export const GetChainRequestSchema: yup.MixedSchema<GetChainRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const GetChainResponseSchema: yup.ObjectSchema<GetChainResponse> = yup
  .object({
    content: yup.array(yup.string().defined()).defined(),
  })
  .defined()

/**
 * Get current, heaviest and genesis block identifiers
 */
router.register<typeof GetChainRequestSchema, GetChainResponse>(
  `${ApiNamespace.chain}/getChain`,
  GetChainRequestSchema,
  async (request, node): Promise<void> => {
    const content = await printChain(node.captain.chain)
    request.end({ content })
  },
)
