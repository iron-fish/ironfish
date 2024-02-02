/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createSigningShare, UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type CreateSigningShareRequest = {
  signingPackage: string
  keyPackage: string
  unsignedTransaction: string
  seed: number //  TODO: remove when we have deterministic nonces
}

export type CreateSigningShareResponse = {
  signingShare: string
}

export const CreateSigningShareRequestSchema: yup.ObjectSchema<CreateSigningShareRequest> = yup
  .object({
    signingPackage: yup.string().defined(),
    keyPackage: yup.string().defined(),
    unsignedTransaction: yup.string().defined(),
    seed: yup.number().defined(),
  })
  .defined()

export const CreateSigningShareResponseSchema: yup.ObjectSchema<CreateSigningShareResponse> =
  yup
    .object({
      signingShare: yup.string().defined(),
    })
    .defined()

routes.register<typeof CreateSigningShareRequestSchema, CreateSigningShareResponse>(
  `${ApiNamespace.multisig}/createSigningShare`,
  CreateSigningShareRequestSchema,
  (request, _context): void => {
    const unsigned = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )
    const result = createSigningShare(
      request.data.signingPackage,
      request.data.keyPackage,
      unsigned.publicKeyRandomness(),
      request.data.seed,
    )

    request.end({
      signingShare: result,
    })
  },
)
