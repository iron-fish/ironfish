/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AxiosError } from 'axios'
import * as yup from 'yup'
import { WebApi } from '../../../webApi'
import { ERROR_CODES, ResponseError, ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetFundsRequest = { accountName: string; email?: string }
export type GetFundsResponse = { id: string }

export const GetFundsRequestSchema: yup.ObjectSchema<GetFundsRequest> = yup
  .object({
    accountName: yup.string().required(),
    email: yup.string().strip(true),
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
    const account = node.accounts.getAccountByName(request.data.accountName)
    if (!account) {
      throw new ValidationError(`Account ${request.data.accountName} could not be found`)
    }

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
          if (data.code === 'faucet_max_requests_reached' && data.message) {
            throw new ResponseError(data.message, ERROR_CODES.ERROR, status)
          } else if (status === 422) {
            throw new ResponseError(
              'You entered an invalid email.',
              ERROR_CODES.VALIDATION,
              status,
            )
          }
        }

        throw new ResponseError(error.message, ERROR_CODES.ERROR, Number(error.code))
      })

    request.end({
      id: response.id.toString(),
    })
  },
)
