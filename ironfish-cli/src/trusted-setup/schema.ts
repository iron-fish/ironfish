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

export type CeremonyClientMessage = {
  method: 'contribution-complete' | 'upload-complete'
}

export const CeremonyClientMessageSchema: yup.ObjectSchema<CeremonyClientMessage> = yup
  .object({
    method: yup.string().oneOf(['contribution-complete', 'upload-complete']).required(),
  })
  .required()
