/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AxiosError } from 'axios'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { WebApi } from '../../../webApi'
import { ERROR_CODES, ResponseError } from '../../adapters'
import { ApiNamespace, router } from '../router'
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

router.register<typeof GetFundsRequestSchema, GetFundsResponse>(
  `${ApiNamespace.faucet}/getFunds`,
  GetFundsRequestSchema,
  async (request, node): Promise<void> => {
    // check node network id
    const networkId = node.internal.get('networkId')

    if (networkId !== 0) {
      // not testnet
      throw new ResponseError('This endpoint is only available for testnet.', ERROR_CODES.ERROR)
    }

    const account = getAccount(node.wallet, request.data.account)

    const api = new WebApi({
      getFundsEndpoint: node.config.get('getFundsApi'),
    })

    const response = await api
      .getFunds({
        email: request.data.email,
        public_key: account.publicAddress,
      })
      .catch((error: AxiosError<{ code: string; message?: string }>) => {
        if (error.response) {
          const { data, status } = error.response

          if (status === 422) {
            if (data.code === 'faucet_max_requests_reached') {
              Assert.isNotUndefined(data.message)
              throw new ResponseError(data.message, ERROR_CODES.VALIDATION, status)
            }

            throw new ResponseError(
              'You entered an invalid email.',
              ERROR_CODES.VALIDATION,
              status,
            )
          } else if (data.message) {
            throw new ResponseError(data.message, ERROR_CODES.ERROR, status)
          }
        }

        throw new ResponseError(error.message, ERROR_CODES.ERROR, Number(error.code))
      })

    request.end({
      id: response.id.toString(),
    })
  },
)
