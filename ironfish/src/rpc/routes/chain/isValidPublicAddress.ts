/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { isValidPublicAddress } from '../../../wallet/validator'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type IsValidPublicAddressRequest = {
  address: string
}

export type IsValidPublicAddressResponse = {
  valid: boolean
}

export const IsValidPublicAddressRequestSchema: yup.ObjectSchema<IsValidPublicAddressRequest> =
  yup
    .object({
      address: yup.string().defined(),
    })
    .defined()

export const IsValidPublicAddressResponseSchema: yup.ObjectSchema<IsValidPublicAddressResponse> =
  yup
    .object({
      valid: yup.boolean().defined(),
    })
    .defined()

routes.register<typeof IsValidPublicAddressRequestSchema, IsValidPublicAddressResponse>(
  `${ApiNamespace.chain}/isValidPublicAddress`,
  IsValidPublicAddressRequestSchema,
  (request): void => {
    request.end({
      valid: isValidPublicAddress(request.data.address),
    })
  },
)
