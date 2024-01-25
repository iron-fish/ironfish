/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey, splitSecret } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type CreateTrustedDealerKeyPackageRequest = {
  minSigners: number
  maxSigners: number
}
export type CreateTrustedDealerKeyPackageResponse = {
  verifyingKey: string
  proofGenerationKey: string
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
  keyPackages: Array<{ identifier: string; keyPackage: string }>
  publicKeyPackage: string
}
export const CreateTrustedDealerKeyPackageRequestSchema: yup.ObjectSchema<CreateTrustedDealerKeyPackageRequest> =
  yup
    .object({
      minSigners: yup.number().defined(),
      maxSigners: yup.number().defined(),
    })
    .defined()

export const CreateTrustedDealerKeyPackageResponseSchema: yup.ObjectSchema<CreateTrustedDealerKeyPackageResponse> =
  yup
    .object({
      verifyingKey: yup.string().defined(),
      proofGenerationKey: yup.string().defined(),
      viewKey: yup.string().defined(),
      incomingViewKey: yup.string().defined(),
      outgoingViewKey: yup.string().defined(),
      publicAddress: yup.string().defined(),
      keyPackages: yup
        .array()
        .of(
          yup
            .object({
              identifier: yup.string().defined(),
              keyPackage: yup.string().defined(),
            })
            .defined(),
        )
        .defined(),
      publicKeyPackage: yup.string().defined(),
    })
    .defined()

routes.register<
  typeof CreateTrustedDealerKeyPackageRequestSchema,
  CreateTrustedDealerKeyPackageResponse
>(
  `${ApiNamespace.multisig}/createTrustedDealerKeyPackage`,
  CreateTrustedDealerKeyPackageRequestSchema,
  async (request, context): Promise<void> => {
    const key = generateKey()
    const { minSigners, maxSigners } = request.data
    splitSecret(key.spendingKey, minSigners, maxSigners)
  },
)
