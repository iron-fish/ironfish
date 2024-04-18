/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem, YupUtils } from '@ironfish/sdk'
import * as yup from 'yup'

export type MultisigTransactionOptions = {
  identity: string[]
  unsignedTransaction: string
  commitment: string[]
  signingPackage: string
  signatureShare: string[]
}

export const MultisigTransactionOptionsSchema: yup.ObjectSchema<
  Partial<MultisigTransactionOptions>
> = yup
  .object({
    identity: yup.array().of(yup.string().defined()),
    unsignedTransaction: yup.string(),
    commitment: yup.array().of(yup.string().defined()),
    signingPackage: yup.string(),
    signatureShare: yup.array().of(yup.string().defined()),
  })
  .defined()

export abstract class MultisigTransactionJson {
  static async load(
    files: FileSystem,
    path?: string,
  ): Promise<Partial<MultisigTransactionOptions>> {
    if (path === undefined) {
      return {}
    }

    const data = (await files.readFile(files.resolve(path))).trim()

    const { error, result } = await YupUtils.tryValidate(MultisigTransactionOptionsSchema, data)

    if (error) {
      throw error
    }

    return result
  }

  static resolveFlags(
    flags: Partial<MultisigTransactionOptions>,
    json: Partial<MultisigTransactionOptions>,
  ): Partial<MultisigTransactionOptions> {
    return {
      identity: flags.identity ?? json.identity,
      unsignedTransaction: flags.unsignedTransaction?.trim() ?? json.unsignedTransaction,
      commitment: flags.commitment ?? json.commitment,
      signingPackage: flags.signingPackage?.trim() ?? json.signingPackage,
      signatureShare: flags.signatureShare ?? json.signatureShare,
    }
  }
}

export type MultisigDkgOptions = {
  secretName: string
  identity: string[]
  minSigners: number
  round1SecretPackage: string
  round1PublicPackage: string[]
  round2SecretPackage: string
  round2PublicPackage: string[]
}

export const MultisigDkgOptionsSchema: yup.ObjectSchema<Partial<MultisigDkgOptions>> = yup
  .object({
    secretName: yup.string(),
    identity: yup.array().of(yup.string().defined()),
    minSigners: yup.number(),
    round1SecretPackage: yup.string(),
    round1PublicPackage: yup.array().of(yup.string().defined()),
    round2SecretPackage: yup.string(),
    round2PublicPackage: yup.array().of(yup.string().defined()),
  })
  .defined()

export abstract class MultisigDkgJson {
  static async load(files: FileSystem, path?: string): Promise<Partial<MultisigDkgOptions>> {
    if (path === undefined) {
      return {}
    }

    const data = (await files.readFile(files.resolve(path))).trim()

    const { error, result } = await YupUtils.tryValidate(MultisigDkgOptionsSchema, data)

    if (error) {
      throw error
    }

    return result
  }

  static resolveFlags(
    flags: Partial<MultisigDkgOptions>,
    json: Partial<MultisigDkgOptions>,
  ): Partial<MultisigDkgOptions> {
    return {
      secretName: flags.secretName ?? json.secretName,
      identity: flags.identity ?? json.identity,
      minSigners: flags.minSigners ?? json.minSigners,
      round1SecretPackage: flags.round1SecretPackage ?? json.round1SecretPackage,
      round1PublicPackage: flags.round1PublicPackage ?? json.round1PublicPackage,
      round2SecretPackage: flags.round2SecretPackage ?? json.round2SecretPackage,
      round2PublicPackage: flags.round2PublicPackage ?? json.round2PublicPackage,
    }
  }
}
