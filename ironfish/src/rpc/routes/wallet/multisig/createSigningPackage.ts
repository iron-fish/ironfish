/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'

export type CreateSigningPackageRequest = {
  unsignedTransaction: string
  commitments: Array<string>
}

export type CreateSigningPackageResponse = {
  signingPackage: string
}

export const CreateSigningPackageRequestSchema: yup.ObjectSchema<CreateSigningPackageRequest> =
  yup
    .object({
      unsignedTransaction: yup.string().defined(),
      commitments: yup.array(yup.string().defined()).defined(),
    })
    .defined()

export const CreateSigningPackageResponseSchema: yup.ObjectSchema<CreateSigningPackageResponse> =
  yup
    .object({
      signingPackage: yup.string().defined(),
    })
    .defined()

routes.register<typeof CreateSigningPackageRequestSchema, CreateSigningPackageResponse>(
  `${ApiNamespace.wallet}/multisig/createSigningPackage`,
  CreateSigningPackageRequestSchema,
  (request, _context): void => {
    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )
    const signingPackage = unsignedTransaction.signingPackage(request.data.commitments)

    request.end({
      signingPackage,
    })
  },
)
