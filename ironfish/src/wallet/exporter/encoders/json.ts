/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { deserializeRpcAccountMultisigKeys } from '../../../rpc/routes/wallet/serializers'
import { JSONUtils, YupUtils } from '../../../utils'
import { ACCOUNT_SCHEMA_VERSION } from '../../account/account'
import { AccountImport, validateAccountImport } from '../accountImport'
import { AccountDecodingOptions, AccountEncoder, DecodeFailed } from '../encoder'

export class JsonEncoder implements AccountEncoder {
  encode(value: AccountImport): string {
    const encoded = serializeAccountEncodedJSON(value)
    return JSON.stringify(encoded)
  }

  decode(value: string, options?: AccountDecodingOptions): AccountImport {
    const [raw, parseError] = JSONUtils.tryParse(value)

    if (parseError) {
      throw new DecodeFailed(`Invalid JSON: ${parseError.message}`, this.constructor.name)
    }

    const { result, error: schemaError } = YupUtils.tryValidateSync(
      AccountEncodedJSONSchema,
      raw,
    )

    if (schemaError) {
      throw new DecodeFailed(`Invalid Schema: ${schemaError.message}`, this.constructor.name)
    }

    const account = deserializeAccountEncodedJSON(result)

    if (options?.name) {
      account.name = options.name
    }

    validateAccountImport(account)
    return account
  }
}

/**
 * This is the type that represents all possible JSON encoded accounts
 * from every supported possible backwards compatible account. DO NOT
 * BREAK backwards compatability of this. If a field is optional, it
 * means there exists an account in the wild that we exported that does
 * not have that field.
 */
type AccountEncodedJSON = {
  version?: number
  name: string
  viewKey?: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
  spendingKey: string | null
  createdAt?: { hash: string; sequence: number; networkId?: number } | string | null
  multisigKeys?: {
    identity?: string
    secret?: string
    keyPackage?: string
    publicKeyPackage: string
  }
  proofAuthorizingKey?: string | null
  ledger: boolean | undefined
}

const AccountEncodedJSONSchema: yup.ObjectSchema<AccountEncodedJSON> = yup
  .object({
    name: yup.string().defined(),
    spendingKey: yup.string().nullable().defined(),
    viewKey: yup.string().optional(),
    publicAddress: yup.string().defined(),
    incomingViewKey: yup.string().defined(),
    outgoingViewKey: yup.string().defined(),
    version: yup.number().optional(),
    createdAt: yup
      .object({
        hash: yup.string().defined(),
        sequence: yup.number().defined(),
        networkId: yup.number().optional(),
      })
      .nullable()
      .optional()
      .default(undefined),
    multisigKeys: yup
      .object({
        secret: yup.string().optional(),
        identity: yup.string().optional(),
        keyPackage: yup.string().optional(),
        publicKeyPackage: yup.string().defined(),
      })
      .optional()
      .default(undefined),
    proofAuthorizingKey: yup.string().nullable().optional(),
    ledger: yup.boolean().optional(),
  })
  .defined()

const serializeAccountEncodedJSON = (accountImport: AccountImport): AccountEncodedJSON => {
  const createdAt = accountImport.createdAt
    ? {
        hash: accountImport.createdAt.hash.toString('hex'),
        sequence: accountImport.createdAt.sequence,
        networkId: accountImport.createdAt.networkId,
      }
    : null

  return {
    version: accountImport.version,
    name: accountImport.name,
    viewKey: accountImport.viewKey,
    incomingViewKey: accountImport.incomingViewKey,
    outgoingViewKey: accountImport.outgoingViewKey,
    publicAddress: accountImport.publicAddress,
    spendingKey: accountImport.spendingKey,
    multisigKeys: accountImport.multisigKeys,
    proofAuthorizingKey: accountImport.proofAuthorizingKey,
    createdAt: createdAt,
    ledger: accountImport.ledger || false,
  }
}

/**
 * Converts a AccountEncodedJSON to AccountImport
 */
function deserializeAccountEncodedJSON(raw: AccountEncodedJSON): AccountImport {
  let viewKey: string
  if (raw.viewKey) {
    viewKey = raw.viewKey
  } else {
    Assert.isNotNull(raw.spendingKey, 'Imported account missing both viewKey and spendingKey')
    viewKey = generateKeyFromPrivateKey(raw.spendingKey).viewKey
  }

  return {
    version: ACCOUNT_SCHEMA_VERSION,
    ...raw,
    viewKey,
    proofAuthorizingKey: raw.proofAuthorizingKey ?? null,
    createdAt:
      raw.createdAt && typeof raw.createdAt === 'object'
        ? {
            hash: Buffer.from(raw.createdAt.hash, 'hex'),
            sequence: raw.createdAt.sequence,
            networkId: raw.createdAt.networkId,
          }
        : null,
    multisigKeys: raw.multisigKeys
      ? deserializeRpcAccountMultisigKeys(raw.multisigKeys)
      : undefined,
    ledger: raw.ledger || false,
  }
}
