/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createSigningShare, UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { AssertMultiSigSigner } from '../../../../wallet'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

export type CreateSigningShareRequest = {
  account: string
  signingPackage: string
  unsignedTransaction: string
  seed: number //  TODO: remove when we have deterministic nonces
}

export type CreateSigningShareResponse = {
  signingShare: string
}

export const CreateSigningShareRequestSchema: yup.ObjectSchema<CreateSigningShareRequest> = yup
  .object({
    account: yup.string().defined(),
    signingPackage: yup.string().defined(),
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
  `${ApiNamespace.wallet}/multisig/createSigningShare`,
  CreateSigningShareRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')

    const account = getAccount(node.wallet, request.data.account)
    AssertMultiSigSigner(account)

    const unsigned = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )
    const result = createSigningShare(
      request.data.signingPackage,
      account.multiSigKeys.identifier,
      account.multiSigKeys.keyPackage,
      unsigned.publicKeyRandomness(),
      request.data.seed,
    )

    request.end({
      signingShare: result,
    })
  },
)
