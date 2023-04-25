/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'

export type RpcNote = {
  hash: string
  serialized: string
}

export const RpcNoteSchema: yup.ObjectSchema<RpcNote> = yup
  .object({
    hash: yup.string().defined(),
    serialized: yup.string().defined(),
  })
  .defined()
