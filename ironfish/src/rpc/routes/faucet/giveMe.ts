/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import axios, { AxiosResponse, AxiosError } from 'axios'

import { ApiNamespace, router } from '../router'
import { ValidationError, ResponseError, ERROR_CODES } from '../../adapters'

export type GiveMeRequest = { accountName: string; email?: string }
export type GiveMeResponse = { message: string }

export const GiveMeRequestSchema: yup.ObjectSchema<GiveMeRequest> = yup
  .object({
    accountName: yup.string().required(),
    email: yup.string().strip(true),
  })
  .defined()

export const GiveMeResponseSchema: yup.ObjectSchema<GiveMeResponse> = yup
  .object({
    message: yup.string().defined(),
  })
  .defined()

router.register<typeof GiveMeRequestSchema, GiveMeResponse>(
  `${ApiNamespace.faucet}/giveMe`,
  GiveMeRequestSchema,
  async (request, node): Promise<void> => {
    const account = node.accounts.getAccountByName(request.data.accountName)
    if (!account)
      throw new ValidationError(`Account ${request.data.accountName} could not be found`)

    const getFundsApi = node.config.get('getFundsApi')
    if (!getFundsApi) {
      throw new ValidationError(`GiveMe requires config.getFundsApi to be set`)
    }

    await axios
      .post(getFundsApi, null, {
        params: {
          email: request.data.email,
          publicKey: account.publicAddress,
        },
      })
      .then(({ data }: AxiosResponse) => {
        request.end(data)
      })
      .catch((error: AxiosError) => {
        throw new ResponseError(error.message, ERROR_CODES.ERROR, Number(error.code))
      })
  },
)
