/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios, { AxiosError } from 'axios'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { RPC_ERROR_CODES, RpcResponseError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from '../wallet/utils'

export type GetFundsRequest = { account?: string; email?: string }
export type GetFundsResponse = { id: string }

export const GetFundsRequestSchema: yup.ObjectSchema<GetFundsRequest> = yup
  .object({
    account: yup.string(),
    email: yup.string().trim(),
  })
  .defined()

export const GetFundsResponseSchema: yup.ObjectSchema<GetFundsResponse> = yup
  .object({
    id: yup.string().defined(),
  })
  .defined()

routes.register<typeof GetFundsRequestSchema, GetFundsResponse>(
  `${ApiNamespace.faucet}/getFunds`,
  GetFundsRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'internal', 'config', 'wallet')

    // check node network id
    const networkId = context.internal.get('networkId')

    if (networkId !== 0) {
      // not testnet
      throw new RpcResponseError(
        'This endpoint is only available for testnet.',
        RPC_ERROR_CODES.ERROR,
      )
    }

    const account = getAccount(context.wallet, request.data.account)

    const getFundsEndpoint = context.config.get('getFundsApi')

    const response = await getFunds(getFundsEndpoint, {
      email: request.data.email,
      public_key: account.publicAddress,
    }).catch((error: AxiosError<{ code: string; message?: string }>) => {
      if (error.response) {
        const { data, status } = error.response

        if (status === 422) {
          if (data.code === 'faucet_max_requests_reached') {
            Assert.isNotUndefined(data.message)
            throw new RpcResponseError(data.message, RPC_ERROR_CODES.VALIDATION, status)
          }

          throw new RpcResponseError(
            'You entered an invalid email.',
            RPC_ERROR_CODES.VALIDATION,
            status,
          )
        } else if (data.message) {
          throw new RpcResponseError(data.message, RPC_ERROR_CODES.ERROR, status)
        }
      }

      throw new RpcResponseError(error.message, RPC_ERROR_CODES.ERROR, Number(error.code))
    })

    request.end({
      id: response.id.toString(),
    })
  },
)

type GetFundsApiRequest = {
  email: string | undefined
  public_key: string
}

type GetFundsApiResponse = {
  id: number
  object: 'faucet_transaction'
  public_key: string
  completed_at: number | null
  started_at: number | null
}

async function getFunds(
  endpoint: string,
  request: GetFundsApiRequest,
): Promise<GetFundsApiResponse> {
  const response = await axios.post<GetFundsApiResponse>(endpoint, request)

  return response.data
}
