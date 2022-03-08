/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export type StratumMessage = {
  id: number
  method: string
  body?: unknown
}

export type MiningSubscribeMessage = {
  publicAddress: string
}

export type MiningSubmitMessage = {
  miningRequestId: number
  randomness: number
}

export type MiningSubscribedMessage = {
  clientId: number
  graffiti: string
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
    graffiti: yup.string().required(),
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
    publicAddress: yup.string().required(),
  })
  .required()

export const MiningSubmitSchema: yup.ObjectSchema<MiningSubmitMessage> = yup
  .object({
    miningRequestId: yup.number().required(),
    randomness: yup.number().required(),
  })
  .required()
