/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig, UnsignedTransaction } from '@ironfish/rust-nodejs'
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
    const transactionHash = unsignedTransaction.hash()

    const account = getAccount(context.wallet, request.data.account)
    AssertMultisig(account)

    const publicKeyPackage = new multisig.PublicKeyPackage(
      account.multisigKeys.publicKeyPackage,
    )
    const identitySet = publicKeyPackage
      .identities()
      .map((identity) => identity.toString('hex'))

    if (request.data.commitments.length < publicKeyPackage.minSigners()) {
      throw new RpcValidationError(
        `A minimum of ${publicKeyPackage.minSigners()} signers is required for a valid signature. Only ${
          request.data.commitments.length
        } commitments provided`,
        400,
      )
    }

    const commitments = request.data.commitments.map(
      (commitment) => new multisig.SigningCommitment(Buffer.from(commitment, 'hex')),
    )

    // Verify the consistency of commitments. Loop twice because the first loop
    // gives a more specific error message (easier to debug)
    const signerIdentities = []
    for (const [index, commitment] of commitments.entries()) {
      const identity = commitment.identity().toString('hex')
      if (!identitySet.includes(identity)) {
        throw new RpcValidationError(
          `Commitment ${index} is from identity ${identity}, which is not part of the multsig group for account ${account.name}`,
          400,
        )
      }
      signerIdentities.push(identity)
    }
    for (const [index, commitment] of commitments.entries()) {
      if (!commitment.verifyChecksum(transactionHash, signerIdentities)) {
        throw new RpcValidationError(
          `Commitment ${index} was not generated for the given unsigned transaction and signer set`,
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
