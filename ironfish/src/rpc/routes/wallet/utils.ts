/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Config } from '../../../fileStores'
import { Note } from '../../../primitives'
import { BufferUtils, CurrencyUtils } from '../../../utils'
import { Account, Base64JsonEncoder, Wallet } from '../../../wallet'
import { AccountImport } from '../../../wallet/exporter/accountImport'
import {
  isMultisigSignerImport,
  isMultisigSignerTrustedDealerImport,
  MultisigKeysImport,
} from '../../../wallet/exporter/multisig'
import { getTransactionStatus, getTransactionType } from '../../../wallet/utils/transaction'
import { AssetValue } from '../../../wallet/walletdb/assetValue'
import { DecryptedNoteValue } from '../../../wallet/walletdb/decryptedNoteValue'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { WorkerPool } from '../../../workerPool'
import { RpcValidationError } from '../../adapters'
import {
  RpcAccountAssetBalanceDelta,
  RpcAccountImport,
  RpcAccountStatus,
  RpcMultisigKeys,
  RpcWalletNote,
  RpcWalletTransaction,
} from './types'

export function getAccount(wallet: Wallet, name?: string): Account {
  if (name) {
    const account = wallet.getAccountByName(name)
    if (account) {
      return account
    }
    throw new RpcValidationError(`No account with name ${name}`)
  }

  const defaultAccount = wallet.getDefaultAccount()
  if (defaultAccount) {
    return defaultAccount
  }

  throw new RpcValidationError(
    `No account is currently active.\n\n` +
      `Use ironfish wallet:create <name> to first create an account`,
  )
}

export async function serializeRpcWalletTransaction(
  config: Config,
  wallet: Wallet,
  account: Account,
  transaction: TransactionValue,
  options?: {
    confirmations?: number
    serialized?: boolean
  },
): Promise<RpcWalletTransaction> {
  const assetBalanceDeltas = await getAssetBalanceDeltas(account, transaction)
  const type = await getTransactionType(account, transaction)
  const confirmations = options?.confirmations ?? config.get('confirmations')
  const status = await getTransactionStatus(account, transaction, confirmations)

  return {
    serialized: options?.serialized
      ? transaction.transaction.serialize().toString('hex')
      : undefined,
    signature: transaction.transaction.transactionSignature().toString('hex'),
    hash: transaction.transaction.hash().toString('hex'),
    fee: transaction.transaction.fee().toString(),
    blockHash: transaction.blockHash?.toString('hex'),
    blockSequence: transaction.sequence ?? undefined,
    notesCount: transaction.transaction.notes.length,
    spendsCount: transaction.transaction.spends.length,
    mintsCount: transaction.transaction.mints.length,
    burnsCount: transaction.transaction.burns.length,
    expiration: transaction.transaction.expiration(),
    timestamp: transaction.timestamp.getTime(),
    submittedSequence: transaction.submittedSequence,
    mints: transaction.transaction.mints.map((mint) => ({
      id: mint.asset.id().toString('hex'),
      metadata: BufferUtils.toHuman(mint.asset.metadata()),
      name: BufferUtils.toHuman(mint.asset.name()),
      creator: mint.asset.creator().toString('hex'),
      value: mint.value.toString(),
      transferOwnershipTo: mint.transferOwnershipTo?.toString('hex'),
      assetId: mint.asset.id().toString('hex'),
      assetName: mint.asset.name().toString('hex'),
    })),
    burns: transaction.transaction.burns.map((burn) => ({
      id: burn.assetId.toString('hex'),
      assetId: burn.assetId.toString('hex'),
      value: burn.value.toString(),
      assetName: '',
    })),
    type,
    status,
    assetBalanceDeltas,
    confirmations,
  }
}

export const serializeRpcImportAccount = (accountImport: AccountImport): RpcAccountImport => {
  const createdAt = accountImport.createdAt
    ? {
        hash: accountImport.createdAt.hash.toString('hex'),
        sequence: accountImport.createdAt.sequence,
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
  }
}

export function deserializeRpcAccountImport(accountImport: RpcAccountImport): AccountImport {
  return {
    ...accountImport,
    createdAt: accountImport.createdAt
      ? {
          hash: Buffer.from(accountImport.createdAt.hash, 'hex'),
          sequence: accountImport.createdAt.sequence,
        }
      : null,
    multisigKeys: accountImport.multisigKeys
      ? deserializeRpcAccountMultisigKeys(accountImport.multisigKeys)
      : undefined,
  }
}

export function deserializeRpcAccountMultisigKeys(
  rpcMultisigKeys: RpcMultisigKeys,
): MultisigKeysImport {
  if (isMultisigSignerImport(rpcMultisigKeys)) {
    return {
      publicKeyPackage: rpcMultisigKeys.publicKeyPackage,
      secret: rpcMultisigKeys.secret,
      keyPackage: rpcMultisigKeys.keyPackage,
    }
  }

  if (isMultisigSignerTrustedDealerImport(rpcMultisigKeys)) {
    return {
      publicKeyPackage: rpcMultisigKeys.publicKeyPackage,
      identity: rpcMultisigKeys.identity,
      keyPackage: rpcMultisigKeys.keyPackage,
    }
  }

  return {
    publicKeyPackage: rpcMultisigKeys.publicKeyPackage,
  }
}

export async function getAssetBalanceDeltas(
  account: Account,
  transaction: TransactionValue,
): Promise<RpcAccountAssetBalanceDelta[]> {
  const assetBalanceDeltas = new Array<RpcAccountAssetBalanceDelta>()

  for (const [assetId, delta] of transaction.assetBalanceDeltas.entries()) {
    const asset = await account.getAsset(assetId)
    const assetName = asset?.name.toString('hex') ?? ''

    assetBalanceDeltas.push({
      assetId: assetId.toString('hex'),
      assetName,
      delta: delta.toString(),
    })
  }

  return assetBalanceDeltas
}

export async function getTransactionNotes(
  workerPool: WorkerPool,
  account: Account,
  transaction: TransactionValue,
): Promise<Array<DecryptedNoteValue>> {
  const notes = []
  const decryptNotesPayloads = []

  let accountHasSpend = false
  for (const spend of transaction.transaction.spends) {
    const noteHash = await account.getNoteHash(spend.nullifier)

    if (noteHash !== undefined) {
      accountHasSpend = true
      break
    }
  }

  for (const note of transaction.transaction.notes) {
    const decryptedNote = await account.getDecryptedNote(note.hash())

    if (decryptedNote) {
      notes.push(decryptedNote)
      continue
    }

    decryptNotesPayloads.push({
      serializedNote: note.serialize(),
      incomingViewKey: account.incomingViewKey,
      outgoingViewKey: account.outgoingViewKey,
      viewKey: account.viewKey,
      currentNoteIndex: null,
      decryptForSpender: true,
    })
  }

  if (accountHasSpend && decryptNotesPayloads.length > 0) {
    const decryptedSends = await workerPool.decryptNotes(decryptNotesPayloads)

    for (const note of decryptedSends) {
      if (note === null) {
        continue
      }

      notes.push({
        accountId: '',
        note: new Note(note.serializedNote),
        index: null,
        nullifier: null,
        transactionHash: transaction.transaction.hash(),
        spent: false,
        blockHash: transaction.blockHash,
        sequence: transaction.sequence,
      })
    }
  }

  return notes
}

export async function getAccountDecryptedNotes(
  workerPool: WorkerPool,
  account: Account,
  transaction: TransactionValue,
): Promise<RpcWalletNote[]> {
  const notes = await getTransactionNotes(workerPool, account, transaction)

  const serializedNotes: RpcWalletNote[] = []

  for await (const decryptedNote of notes) {
    const asset = await account.getAsset(decryptedNote.note.assetId())

    serializedNotes.push(serializeRpcWalletNote(decryptedNote, account.publicAddress, asset))
  }

  return serializedNotes
}

export function serializeRpcWalletNote(
  note: DecryptedNoteValue,
  publicAddress: string,
  asset?: AssetValue,
): RpcWalletNote {
  return {
    value: CurrencyUtils.encode(note.note.value()),
    assetId: note.note.assetId().toString('hex'),
    assetName: asset?.name.toString('hex') || '',
    memo: BufferUtils.toHuman(note.note.memo()),
    memoHex: note.note.memo().toString('hex'),
    owner: note.note.owner(),
    sender: note.note.sender(),
    noteHash: note.note.hash().toString('hex'),
    transactionHash: note.transactionHash.toString('hex'),
    index: note.index,
    nullifier: note.nullifier?.toString('hex') ?? null,
    spent: note.spent,
    isOwner: note.note.owner() === publicAddress,
    hash: note.note.hash().toString('hex'),
  }
}

export async function serializeRpcAccountStatus(
  wallet: Wallet,
  account: Account,
): Promise<RpcAccountStatus> {
  const head = await account.getHead()

  return {
    name: account.name,
    id: account.id,
    head: head
      ? {
          hash: head.hash.toString('hex'),
          sequence: head.sequence,
          inChain: wallet.nodeClient ? await wallet.chainHasBlock(head.hash) : null,
        }
      : null,
    scanningEnabled: account.scanningEnabled,
    viewOnly: !account.isSpendingAccount(),
  }
}

export async function tryDecodeAccountWithMultisigSecrets(
  wallet: Wallet,
  value: string,
  options?: { name?: string },
): Promise<AccountImport | undefined> {
  const encoder = new Base64JsonEncoder()

  for await (const { name, secret } of wallet.walletDb.getMultisigSecrets()) {
    try {
      return encoder.decode(value, { name: options?.name ?? name, multisigSecret: secret })
    } catch (e: unknown) {
      continue
    }
  }

  return undefined
}
