/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export type StratumMessage = {
  id: number
  method: string
  body?: unknown
}

export type MiningDisconnectMessage =
  | {
      reason?: string
      versionExpected?: number
      bannedUntil?: number
      message?: string
    }
  | undefined

export type MiningSubscribeMessage = {
  version?: number
  publicAddress: string
}

export type MiningSubmitMessage = {
  miningRequestId: number
  randomness: string
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

export type MiningGetStatusMessage =
  | {
      publicAddress?: string
    }
  | undefined

export type MiningStatusMessage = {
  name: string
  hashRate: number
  miners: number
  clients: number
  bans: number
  sharesPending: number
  addressStatus?: {
    publicAddress: string
    hashRate: number
    miners: number
    sharesPending: number
  }
}

export const StratumMessageSchema: yup.ObjectSchema<StratumMessage> = yup
  .object({
    id: yup.number().required(),
    method: yup.string().required(),
    body: yup.mixed().notRequired(),
  })
  .required()

export const MiningDisconnectMessageSchema: yup.ObjectSchema<MiningDisconnectMessage> = yup
  .object({
    reason: yup.string().optional(),
    versionExpected: yup.number().optional(),
    bannedUntil: yup.number().optional(),
    message: yup.string().optional(),
  })
  .optional()

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
    version: yup.number().optional(),
    publicAddress: yup.string().required(),
  })
  .required()

export const MiningSubmitSchema: yup.ObjectSchema<MiningSubmitMessage> = yup
  .object({
    miningRequestId: yup.number().required(),
    randomness: yup.string().required(),
  })
  .required()

export const MiningGetStatusSchema: yup.ObjectSchema<MiningGetStatusMessage> = yup
  .object({
    publicAddress: yup.string().optional(),
  })
  .default(undefined)

export const MiningStatusSchema: yup.ObjectSchema<MiningStatusMessage> = yup
  .object({
    name: yup.string().required(),
    hashRate: yup.number().required(),
    miners: yup.number().required(),
    sharesPending: yup.number().required(),
    clients: yup.number().required(),
    bans: yup.number().required(),
    addressStatus: yup
      .object({
        publicAddress: yup.string().required(),
        hashRate: yup.number().required(),
        miners: yup.number().required(),
        sharesPending: yup.number().required(),
      })
      .default(undefined),
  })
  .required()
