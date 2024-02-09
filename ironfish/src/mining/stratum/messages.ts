/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export type StratumMessage = {
  id: number
  method: string
  body?: unknown
}

export interface StratumMessageWithError extends Omit<StratumMessage, 'method' | 'body'> {
  error: {
    id: number
    message: string
  }
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
  version: number
  name?: string
  publicAddress: string
  agent?: string
}

export type MiningSubmitMessageV1 = {
  miningRequestId: number
  randomness: string
}

export type MiningSubmitMessageV2 = {
  miningRequestId: number
  randomness: string
  graffiti: string
}

export type MiningSubmitMessageV3 = {
  miningRequestId: number
  randomness: string
}

export type MiningSubscribedMessageV1 = {
  clientId: number
  graffiti: string
}

export type MiningSubscribedMessageV2 = {
  clientId: number
  xn: string
}

export type MiningSubscribedMessageV3 = {
  clientId: number
  xn: string
}

export type MiningSubmittedMessage = {
  id: number
  result: boolean
  message?: string
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
    connectedMiners: string[]
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

export const StratumMessageWithErrorSchema: yup.ObjectSchema<StratumMessageWithError> = yup
  .object({
    id: yup.number().required(),
    error: yup
      .object({
        id: yup.number().required(),
        message: yup.string().required(),
      })
      .required(),
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

export const MiningSubscribedMessageSchemaV1: yup.ObjectSchema<MiningSubscribedMessageV1> = yup
  .object({
    clientId: yup.number().required(),
    graffiti: yup.string().required(),
  })
  .required()

export const MiningSubscribedMessageSchemaV2: yup.ObjectSchema<MiningSubscribedMessageV2> = yup
  .object({
    clientId: yup.number().required(),
    xn: yup.string().required(),
  })
  .required()

export const MiningSubscribedMessageSchemaV3: yup.ObjectSchema<MiningSubscribedMessageV3> = yup
  .object({
    clientId: yup.number().required(),
    xn: yup.string().required(),
  })
  .required()

export const MiningSetTargetSchema: yup.ObjectSchema<MiningSetTargetMessage> = yup
  .object({
    target: yup.string().required(),
  })
  .required()

export const MiningSubmittedSchema: yup.ObjectSchema<MiningSubmittedMessage> = yup
  .object({
    id: yup.number().required(),
    result: yup.bool().required(),
    message: yup.string().optional(),
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
    version: yup.number().required(),
    name: yup.string().optional(),
    publicAddress: yup.string().required(),
    agent: yup.string().optional(),
  })
  .required()

export const MiningSubmitSchemaV1: yup.ObjectSchema<MiningSubmitMessageV1> = yup
  .object({
    miningRequestId: yup.number().required(),
    randomness: yup.string().required(),
  })
  .required()

export const MiningSubmitSchemaV2: yup.ObjectSchema<MiningSubmitMessageV2> = yup
  .object({
    miningRequestId: yup.number().required(),
    randomness: yup.string().required(),
    graffiti: yup.string().required(),
  })
  .required()

export const MiningSubmitSchemaV3: yup.ObjectSchema<MiningSubmitMessageV3> = yup
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
        connectedMiners: yup.array(yup.string().required()).defined(),
        hashRate: yup.number().required(),
        miners: yup.number().required(),
        sharesPending: yup.number().required(),
      })
      .default(undefined),
  })
  .required()
