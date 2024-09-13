/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { RPC_ERROR_CODES, RpcValidationError } from '../../../../adapters'
import { ApiNamespace } from '../../../namespaces'
import { routes } from '../../../router'
import { AssertHasRpcContext } from '../../../rpcContext'

export type DkgRound1Request = {
  participantName: string
  minSigners: number
  participants: Array<{ identity: string }>
}

export type DkgRound1Response = {
  round1SecretPackage: string
  round1PublicPackage: string
}

export const DkgRound1RequestSchema: yup.ObjectSchema<DkgRound1Request> = yup
  .object({
    participantName: yup.string().defined(),
    minSigners: yup.number().defined(),
    participants: yup
      .array()
      .of(yup.object({ identity: yup.string().defined() }).defined())
      .defined(),
  })
  .defined()

export const DkgRound1ResponseSchema: yup.ObjectSchema<DkgRound1Response> = yup
  .object({
    round1SecretPackage: yup.string().defined(),
    round1PublicPackage: yup.string().defined(),
  })
  .defined()

routes.register<typeof DkgRound1RequestSchema, DkgRound1Response>(
  `${ApiNamespace.wallet}/multisig/dkg/round1`,
  DkgRound1RequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')

    const { participantName, minSigners, participants } = request.data
    const multisigSecret = await node.wallet.walletDb.getMultisigSecretByName(participantName)

    if (!multisigSecret) {
      throw new RpcValidationError(
        `Multisig secret with name '${participantName}' not found`,
        400,
        RPC_ERROR_CODES.MULTISIG_SECRET_NOT_FOUND,
      )
    }

    const participantIdentities = participants.map((p) => p.identity)
    const selfIdentity = new multisig.ParticipantSecret(multisigSecret)
      .toIdentity()
      .serialize()
      .toString('hex')

    if (!participantIdentities.includes(selfIdentity)) {
      participantIdentities.push(selfIdentity)
    }

    if (minSigners < 2) {
      throw new RpcValidationError(
        `minSigners must be 2 or greater, got ${minSigners}`,
        400,
        RPC_ERROR_CODES.VALIDATION,
      )
    }

    if (minSigners > participantIdentities.length) {
      throw new RpcValidationError(
        `minSigners (${minSigners}) exceeds the number of participants (${participantIdentities.length})`,
        400,
        RPC_ERROR_CODES.VALIDATION,
      )
    }

    const packages = multisig.dkgRound1(selfIdentity, minSigners, participantIdentities)

    request.end(packages)
  },
)
