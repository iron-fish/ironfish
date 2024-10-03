/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export type MultisigBrokerMessage = {
  id: number
  method: string
  sessionId: string
  body?: unknown
}

export interface MultisigBrokerMessageWithError
  extends Omit<MultisigBrokerMessage, 'method' | 'body' | 'sessionId'> {
  error: {
    id: number
    message: string
  }
}

export type MultisigBrokerAckMessage = {
  messageId: number
}

export type DkgStartSessionMessage = {
  minSigners: number
  maxSigners: number
}

export type SigningStartSessionMessage = {
  numSigners: number
  unsignedTransaction: string
}

export type JoinSessionMessage = object | undefined

export type IdentityMessage = {
  identity: string
}

export type Round1PublicPackageMessage = {
  package: string
}

export type Round2PublicPackageMessage = {
  package: string
}

export type SigningCommitmentMessage = {
  signingCommitment: string
}

export type SignatureShareMessage = {
  signatureShare: string
}

export type DkgGetStatusMessage = object | undefined

export type DkgStatusMessage = {
  minSigners: number
  maxSigners: number
  identities: string[]
  round1PublicPackages: string[]
  round2PublicPackages: string[]
}

export type SigningGetStatusMessage = object | undefined

export type SigningStatusMessage = {
  numSigners: number
  unsignedTransaction: string
  identities: string[]
  signingCommitments: string[]
  signatureShares: string[]
}

export type ConnectedMessage = object | undefined

export const MultisigBrokerMessageSchema: yup.ObjectSchema<MultisigBrokerMessage> = yup
  .object({
    id: yup.number().required(),
    method: yup.string().required(),
    sessionId: yup.string().required(),
    body: yup.mixed().notRequired(),
  })
  .required()

export const MultisigBrokerMessageWithErrorSchema: yup.ObjectSchema<MultisigBrokerMessageWithError> =
  yup
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

export const MultisigBrokerAckSchema: yup.ObjectSchema<MultisigBrokerAckMessage> = yup
  .object({
    messageId: yup.number().required(),
  })
  .required()

export const DkgStartSessionSchema: yup.ObjectSchema<DkgStartSessionMessage> = yup
  .object({
    minSigners: yup.number().defined(),
    maxSigners: yup.number().defined(),
  })
  .defined()

export const SigningStartSessionSchema: yup.ObjectSchema<SigningStartSessionMessage> = yup
  .object({
    numSigners: yup.number().defined(),
    unsignedTransaction: yup.string().defined(),
  })
  .defined()

export const JoinSessionSchema: yup.ObjectSchema<JoinSessionMessage> = yup
  .object({})
  .notRequired()
  .default(undefined)

export const IdentitySchema: yup.ObjectSchema<IdentityMessage> = yup
  .object({
    identity: yup.string().defined(),
  })
  .defined()

export const Round1PublicPackageSchema: yup.ObjectSchema<Round1PublicPackageMessage> = yup
  .object({ package: yup.string().defined() })
  .defined()

export const Round2PublicPackageSchema: yup.ObjectSchema<Round2PublicPackageMessage> = yup
  .object({ package: yup.string().defined() })
  .defined()

export const SigningCommitmentSchema: yup.ObjectSchema<SigningCommitmentMessage> = yup
  .object({ signingCommitment: yup.string().defined() })
  .defined()

export const SignatureShareSchema: yup.ObjectSchema<SignatureShareMessage> = yup
  .object({ signatureShare: yup.string().defined() })
  .defined()

export const DkgGetStatusSchema: yup.ObjectSchema<DkgGetStatusMessage> = yup
  .object({})
  .notRequired()
  .default(undefined)

export const DkgStatusSchema: yup.ObjectSchema<DkgStatusMessage> = yup
  .object({
    minSigners: yup.number().defined(),
    maxSigners: yup.number().defined(),
    identities: yup.array(yup.string().defined()).defined(),
    round1PublicPackages: yup.array(yup.string().defined()).defined(),
    round2PublicPackages: yup.array(yup.string().defined()).defined(),
  })
  .defined()

export const SigningGetStatusSchema: yup.ObjectSchema<SigningGetStatusMessage> = yup
  .object({})
  .notRequired()
  .default(undefined)

export const SigningStatusSchema: yup.ObjectSchema<SigningStatusMessage> = yup
  .object({
    numSigners: yup.number().defined(),
    unsignedTransaction: yup.string().defined(),
    identities: yup.array(yup.string().defined()).defined(),
    signingCommitments: yup.array(yup.string().defined()).defined(),
    signatureShares: yup.array(yup.string().defined()).defined(),
  })
  .defined()

export const ConnectedMessageSchema: yup.ObjectSchema<ConnectedMessage> = yup
  .object({})
  .notRequired()
  .default(undefined)
