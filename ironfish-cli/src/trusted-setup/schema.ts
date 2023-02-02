/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'

export type CeremonyServerMessage =
  | {
      method: 'joined'
      queueLocation: number
      estimate: number
    }
  | {
      method: 'initiate-contribution'
      downloadLink: string
      contributionNumber: number
    }
  | {
      method: 'initiate-upload'
      uploadLink: string
    }
  | {
      method: 'contribution-verified'
      hash: string
      downloadLink: string
      contributionNumber: number
    }
  | {
      method: 'disconnect'
      error: string
    }

export type CeremonyClientMessage = {
  method: 'contribution-complete' | 'upload-complete' | 'join'
  name?: string // only used on join
  token?: string // only used on join
}

export const CeremonyClientMessageSchema: yup.ObjectSchema<CeremonyClientMessage> = yup
  .object({
    method: yup.string().oneOf(['contribution-complete', 'upload-complete', 'join']).required(),
    name: yup.string(),
    token: yup.string(),
  })
  .required()
