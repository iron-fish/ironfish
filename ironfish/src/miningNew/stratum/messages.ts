/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import * as yup from 'yup'

export type StratumMessage<
  TType extends string = string,
  TBody extends unknown | undefined = unknown | undefined,
> = {
  id: number
  method: TType
  body: TBody
}

export type MiningSubscribeMessage = {
  graffiti: string
}

export type MiningSubmitMessage = {
  miningRequestId: number
  randomness: number
  graffiti: string
}

export type MiningSubscribedMessage = {
  clientId: number
}

export type MiningSetTargetMessage = {
  target: string
}

export type MiningWaitForWorkMessage = undefined

export type MiningNotifyMessage = {
  miningRequestId: number
  header: string
}

export const StratumMessageSchema: yup.ObjectSchema<StratumMessage> = yup
  .object({
    id: yup.number().required(),
    method: yup.string().required(),
    body: yup.mixed().notRequired(),
  })
  .required()

export const MiningSubscribedMessageSchema: yup.ObjectSchema<MiningSubscribedMessage> = yup
  .object({
    clientId: yup.number().required(),
  })
  .required()

export const MiningSetTargetSchema: yup.ObjectSchema<MiningSetTargetMessage> = yup
  .object({
    target: yup.string().required(),
  })
  .required()

export const MiningNotifySchema: yup.ObjectSchema<MiningNotifyMessage> = yup
  .object({
    miningRequestId: yup.number().required(),
    header: yup.string().required(),
  })
  .required()

export const MiningWaitForWorkSchema: yup.MixedSchema<MiningWaitForWorkMessage> = yup
  .mixed()
  .oneOf([undefined] as const)

export const MiningSubscribeSchema: yup.ObjectSchema<MiningSubscribeMessage> = yup
  .object({
    graffiti: yup.string().required(),
  })
  .required()

export const MiningSubmitSchema: yup.ObjectSchema<MiningSubmitMessage> = yup
  .object({
    miningRequestId: yup.number().required(),
    randomness: yup.number().required(),
    graffiti: yup.string().required(),
  })
  .required()

// export type StratumMessageMiningSubmit = {
//   id: number
//   method: 'mining.submit'
//   params: [requestId: number, randomness: number, graffiti: string]
// }

// export type StratumRequest =
//   | {
//       id: number
//       method?: string
//     }
//   | StratumMessageMiningSubmit
//   | StratumMessageMiningSubscribe

// export type StratumResponse =
//   | {
//       id: number
//       method?: string
//       params?: unknown
//     }
//   | StratumMessageMiningSetTarget
//   | StratumMessageMiningNotify
//   | StratumMessageMiningSubscribed

// export type StratumMessageMiningSetTarget = {
//   id: number
//   method: 'mining.set_target'
//   params: [target: string]
// }

// export type StratumMessageMiningNotify = {
//   id: number
//   method: 'mining.notify'
//   params: [requestId: number, headerHex: string]
// }

// export type StratumMessageMiningWaitForWork = {
//   id: number
//   method: 'mining.wait_for_work'
//   params: []
// }

// export type StratumMessageMiningSubscribed = {
//   id: number
//   method?: string
//   result: number
// }

// export type StratumNotification = {
//   // Technically this wont have an id, but placeholder
//   id: number
//   method?: string
//   params?: unknown
// }

// export type StratumMessage = StratumRequest | StratumResponse | StratumNotification
