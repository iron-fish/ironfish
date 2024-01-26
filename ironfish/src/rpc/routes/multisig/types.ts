/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'

export type RpcSigningCommitments = {
  hiding: string
  binding: string
}

export const RpcSigningCommitmentsSchema: yup.ObjectSchema<RpcSigningCommitments> = yup
  .object({
    hiding: yup.string().defined(),
    binding: yup.string().defined(),
  })
  .defined()
