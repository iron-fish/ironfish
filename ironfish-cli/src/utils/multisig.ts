/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem, RpcClient, YupUtils } from '@ironfish/sdk'
import inquirer from 'inquirer'
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

async function load(
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

type MultisigTransactionFlags = {
  identity?: string[]
  unsignedTransaction?: string
  commitment?: string[]
  signingPackage?: string
  signatureShare?: string[]
}

function resolveFlags(
  flags: MultisigTransactionFlags,
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

export const MultisigTransactionJson = {
  load,
  resolveFlags,
}

export async function selectSecret(client: Pick<RpcClient, 'wallet'>): Promise<string> {
  const identitiesResponse = await client.wallet.multisig.getIdentities()

  const choices = []
  for (const { name } of identitiesResponse.content.identities) {
    choices.push({
      name,
      value: name,
    })
  }

  choices.sort((a, b) => a.name.localeCompare(b.name))

  const selection = await inquirer.prompt<{
    name: string
  }>([
    {
      name: 'name',
      message: 'Select participant secret name',
      type: 'list',
      choices,
    },
  ])

  return selection.name
}
