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

export type DkgConfigMessage = {
  minSigners: number
  maxSigners: number
}

export type IdentityMessage = {
  identity: string
}

export type Round1PublicPackageMessage = {
  package: string
}

export type Round2PublicPackageMessage = {
  package: string
}

export type DkgGetStatusMessage = object | undefined

export type DkgStatusMessage = {
  minSigners: number
  maxSigners: number
  identities: string[]
  round1PublicPackages: string[]
  round2PublicPackages: string[]
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

export const DkgConfigSchema: yup.ObjectSchema<DkgConfigMessage> = yup
  .object({
    minSigners: yup.number().defined(),
    maxSigners: yup.number().defined(),
  })
  .defined()

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
