/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../../assert'
import { FullNode } from '../../../../node'
import { ACCOUNT_SCHEMA_VERSION, JsonEncoder } from '../../../../wallet'
import { AccountImport } from '../../../../wallet/exporter'
import { encryptEncodedAccount } from '../../../../wallet/exporter/encryption'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'

export type CreateTrustedDealerKeyPackageRequest = {
  minSigners: number
  participants: Array<{ identity: string }>
}

export type CreateTrustedDealerKeyPackageResponse = {
  publicAddress: string
  publicKeyPackage: string
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  proofAuthorizingKey: string
  participantAccounts: Array<{ identity: string; account: string }>
  ledger: boolean
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
      ledger: yup.boolean().defined(),
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

    const identities = request.data.participants.map((p) => p.identity)

    const {
      publicAddress,
      publicKeyPackage,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      proofAuthorizingKey,
      keyPackages,
    } = multisig.generateAndSplitKey(request.data.minSigners, identities)

    const createdAt = {
      hash: node.chain.latest.hash,
      sequence: node.chain.latest.sequence,
    }

    const participants = keyPackages.map(({ identity, keyPackage }) => {
      const account: AccountImport = {
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
        ledger: false,
      }

      const encoder = new JsonEncoder()
      const encoded = encoder.encode(account)

      const participant = new multisig.ParticipantIdentity(Buffer.from(identity, 'hex'))

      const encrypted = encryptEncodedAccount(encoded, {
        kind: 'MultisigIdentity',
        identity: participant,
      })

      return {
        identity,
        account: encrypted,
      }
    })

    request.end({
      publicAddress,
      publicKeyPackage,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      proofAuthorizingKey,
      participantAccounts: participants,
      ledger: false,
    })
  },
)
