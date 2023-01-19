/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export type CeremonyServerMessage =
  | {
      method: 'joined'
      queueLocation: number
    }
  | {
      method: 'initiate-contribution'
      downloadLink: string
    }
  | {
      method: 'contribution-verified'
      downloadLink: string
    }

export type CeremonyClientMessage =
  | {
      method: 'join'
    }
  | {
      method: 'contribution-complete'
    }
  | {
      method: 'upload-complete'
    }

// export const CeremonyServerMessageSchema: yup.MixedSchema<CeremonyServerMessage> = yup
//   .mixed()
//   .oneOf([
//     yup
//       .object({
//         method: yup.string().oneOf(['joined']).required(),
//         queueLocation: yup.number().required(),
//       })
//       .required(),
//     yup
//       .object({
//         method: yup.string().oneOf(['intiate-contribution']).required(),
//         downloadLink: yup.string().required(),
//       })
//       .required(),
//     yup
//       .object({
//         method: yup.string().oneOf(['contribution-verified']).required(),
//         downloadLink: yup.string().required(),
//       })
//       .required(),
//   ])
//   .required()
