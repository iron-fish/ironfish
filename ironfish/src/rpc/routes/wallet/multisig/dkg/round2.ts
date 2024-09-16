/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { RPC_ERROR_CODES, RpcValidationError } from '../../../../adapters'
import { ApiNamespace } from '../../../namespaces'
import { routes } from '../../../router'
import { AssertHasRpcContext } from '../../../rpcContext'

export type DkgRound2Request = {
  participantName: string
  round1SecretPackage: string
  round1PublicPackages: Array<string>
}

export type DkgRound2Response = {
  round2SecretPackage: string
  round2PublicPackage: string
}

export const DkgRound2RequestSchema: yup.ObjectSchema<DkgRound2Request> = yup
  .object({
    participantName: yup.string().defined(),
    round1SecretPackage: yup.string().defined(),
    round1PublicPackages: yup.array().of(yup.string().defined()).defined(),
  })
  .defined()

export const DkgRound2ResponseSchema: yup.ObjectSchema<DkgRound2Response> = yup
  .object({
    round2SecretPackage: yup.string().defined(),
    round2PublicPackage: yup.string().defined(),
  })
  .defined()

routes.register<typeof DkgRound2RequestSchema, DkgRound2Response>(
  `${ApiNamespace.wallet}/multisig/dkg/round2`,
  DkgRound2RequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')

    const { participantName, round1SecretPackage, round1PublicPackages } = request.data
    const multisigSecret = await node.wallet.walletDb.getMultisigSecretByName(participantName)

    if (!multisigSecret) {
      throw new RpcValidationError(
        `Multisig secret with name '${participantName}' not found`,
        400,
        RPC_ERROR_CODES.MULTISIG_SECRET_NOT_FOUND,
      )
    }

    const secret = multisigSecret.toString('hex')

    const packages = multisig.dkgRound2(secret, round1SecretPackage, round1PublicPackages)

    request.end(packages)
  },
)
