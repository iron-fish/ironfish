/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey, splitSecret } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../../assert'
import { FullNode } from '../../../../node'
import { ACCOUNT_SCHEMA_VERSION, Base64JsonEncoder } from '../../../../wallet'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'

export type CreateTrustedDealerKeyPackageRequest = {
  minSigners: number
  participants: Array<{
    identity: string
  }>
}

export type CreateTrustedDealerKeyPackageResponse = {
  publicAddress: string
  publicKeyPackage: string
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  proofAuthorizingKey: string
  participantAccounts: Array<{ identity: string; account: string }>
}

export const CreateTrustedDealerKeyPackageRequestSchema: yup.ObjectSchema<CreateTrustedDealerKeyPackageRequest> =
  yup
    .object({
      minSigners: yup.number().defined(),
      participants: yup
        .array()
        .of(yup.object({ identity: yup.string().defined() }).defined())
        .defined(),
    })
    .defined()

export const CreateTrustedDealerKeyPackageResponseSchema: yup.ObjectSchema<CreateTrustedDealerKeyPackageResponse> =
  yup
    .object({
      publicAddress: yup.string().defined(),
      publicKeyPackage: yup.string().defined(),
      viewKey: yup.string().defined(),
      incomingViewKey: yup.string().defined(),
      outgoingViewKey: yup.string().defined(),
      proofAuthorizingKey: yup.string().defined(),
      participantAccounts: yup
        .array(
          yup
            .object({
              identity: yup.string().defined(),
              account: yup.string().defined(),
            })
            .defined(),
        )
        .defined(),
    })
    .defined()

routes.register<
  typeof CreateTrustedDealerKeyPackageRequestSchema,
  CreateTrustedDealerKeyPackageResponse
>(
  `${ApiNamespace.wallet}/multisig/createTrustedDealerKeyPackage`,
  CreateTrustedDealerKeyPackageRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    const key = generateKey()
    const { minSigners, participants } = request.data
    const identities = participants.map((p) => p.identity)
    const {
      publicAddress,
      publicKeyPackage,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      proofAuthorizingKey,
      keyPackages,
    } = splitSecret(key.spendingKey, minSigners, identities)

    const latestHeader = node.chain.latest
    const createdAt = {
      hash: latestHeader.hash,
      sequence: latestHeader.sequence,
    }

    const encoder = new Base64JsonEncoder()
    const participantAccounts = keyPackages.map(({ identity, keyPackage }) => ({
      identity,
      account: encoder.encode({
        name: identity,
        version: ACCOUNT_SCHEMA_VERSION,
        createdAt,
        spendingKey: null,
        viewKey,
        incomingViewKey,
        outgoingViewKey,
        publicAddress,
        proofAuthorizingKey,
        multisigKeys: {
          identity,
          keyPackage,
          publicKeyPackage,
        },
      }),
    }))

    request.end({
      publicAddress,
      publicKeyPackage,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      proofAuthorizingKey,
      participantAccounts,
    })
  },
)
