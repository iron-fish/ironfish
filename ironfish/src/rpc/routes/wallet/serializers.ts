/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Config } from '../../../fileStores'
import { BufferUtils, CurrencyUtils } from '../../../utils'
import { Account, Wallet } from '../../../wallet'
import {
  isMultisigHardwareSignerImport,
  isMultisigSignerImport,
  isMultisigSignerTrustedDealerImport,
  MultisigKeysImport,
} from '../../../wallet/exporter/multisig'
import { AssetValue } from '../../../wallet/walletdb/assetValue'
import { DecryptedNoteValue } from '../../../wallet/walletdb/decryptedNoteValue'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import {
  RpcAccountAssetBalanceDelta,
  RpcAccountStatus,
  RpcMultisigKeys,
  RpcWalletNote,
  RpcWalletTransaction,
} from './types'

async function getAssetBalanceDeltas(
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
  const type = await wallet.getTransactionType(account, transaction)
  const confirmations = options?.confirmations ?? config.get('confirmations')
  const status = await wallet.getTransactionStatus(account, transaction, {
    confirmations,
  })

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
      owner: mint.asset.creator().toString('hex'),
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

  if (isMultisigHardwareSignerImport(rpcMultisigKeys)) {
    return {
      publicKeyPackage: rpcMultisigKeys.publicKeyPackage,
      identity: rpcMultisigKeys.identity,
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
    default: wallet.getDefaultAccount()?.id === account.id,
  }
}
