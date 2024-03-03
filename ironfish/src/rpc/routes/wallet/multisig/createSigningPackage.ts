/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PublicKeyPackage, SigningCommitment, UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { AssertMultisig } from '../../../../wallet'
import { RpcValidationError } from '../../../adapters'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

export type CreateSigningPackageRequest = {
  unsignedTransaction: string
  commitments: Array<string>
  account?: string
}

export type CreateSigningPackageResponse = {
  signingPackage: string
}

export const CreateSigningPackageRequestSchema: yup.ObjectSchema<CreateSigningPackageRequest> =
  yup
    .object({
      unsignedTransaction: yup.string().defined(),
      commitments: yup.array(yup.string().defined()).defined(),
      account: yup.string().optional(),
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
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')

    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )

    const account = getAccount(context.wallet, request.data.account)
    AssertMultisig(account)

    const publicKeyPackage = new PublicKeyPackage(account.multisigKeys.publicKeyPackage)
    const identitySet = new Set(
      publicKeyPackage.identities().map((identity) => identity.toString('hex')),
    )

    for (const commitment of request.data.commitments) {
      const signingCommitment = new SigningCommitment(Buffer.from(commitment, 'hex'))
      const identity = signingCommitment.identity().toString('hex')
      if (!identitySet.has(identity)) {
        throw new RpcValidationError(
          `Received commitment from identity (${identity}) that is not part of the multsig group for account ${account.name}`,
          400,
        )
      }
    }
    const signingPackage = unsignedTransaction.signingPackage(request.data.commitments)

    request.end({
      signingPackage,
    })
  },
)
