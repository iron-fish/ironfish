/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferSet } from 'buffer-map'
import { Assert } from '../../../assert'
import { Blockchain } from '../../../blockchain'
import { VerificationResult } from '../../../consensus/verifier'
import { createRootLogger, Logger } from '../../../logger'
import { BlockHeader } from '../../../primitives/blockheader'
import { BlockchainUtils, BufferUtils, HashUtils } from '../../../utils'
import { RpcTransaction } from './types'
import { Transaction } from '../../../primitives'
import { getTransactionSize } from '../../../network/utils/serializers'

const DEFAULT_OPTIONS = {
  seq: true,
  work: true,
  indent: '|',
}

export async function logChain(
  chain: Blockchain,
  start?: number | null,
  end?: number | null,
  options: {
    prev?: boolean
    merge?: boolean
    seq?: boolean
    work?: boolean
    indent?: string
  } = DEFAULT_OPTIONS,
  logger?: Logger,
): Promise<void> {
  const content = await renderChain(chain, start, end, options, logger)

  if (logger) {
    logger.info(content.join('\n'))
  } else {
    // eslint-disable-next-line no-console
    console.log(content.join('\n'))
  }
}

export async function renderChain(
  chain: Blockchain,
  start?: number | null,
  stop?: number | null,
  options: {
    prev?: boolean
    seq?: boolean
    work?: boolean
    indent?: string
  } = DEFAULT_OPTIONS,
  logger = createRootLogger(),
): Promise<string[]> {
  const content: string[] = []

  let trees: VerificationResult = { valid: true }
  if (chain.head) {
    const headBlock = await chain.getBlock(chain.head)
    Assert.isNotNull(headBlock)
    trees = await chain.verifier.verifyConnectedBlock(headBlock)
  }

  content.push(
    '======',
    `GENESIS: ${chain.genesis.hash.toString('hex') || '-'}`,
    `HEAD:    ${chain.head.hash.toString('hex') || '-'}`,
    `LATEST:  ${chain.latest.hash.toString('hex') || '-'}`,
    `TREES:   ${trees.valid ? 'OK' : `ERROR: ${String(trees.reason)}`}`,
    '======',
  )

  const { start: startHeight, stop: stopHeight } = BlockchainUtils.getBlockRange(chain, {
    start,
    stop,
  })

  const roots = await chain.getHeadersAtSequence(startHeight)

  for (const root of roots) {
    await renderGraph(chain, root, stopHeight, content, options, logger)
  }

  return content
}

export async function renderGraph(
  chain: Blockchain,
  header: BlockHeader,
  end: number,
  content: string[],
  options: {
    prev?: boolean
    seq?: boolean
    work?: boolean
    indent?: string
  } = DEFAULT_OPTIONS,
  logger = createRootLogger(),
  last = true,
  _only = true,
  indent = '',
  seen = new BufferSet(),
): Promise<void> {
  Assert.isNotNull(chain.latest)
  Assert.isNotNull(chain.head)
  Assert.isNotNull(chain.genesis)

  seen.add(header.hash)

  let rendered = `+- Block ${HashUtils.renderHash(header.hash)}`

  if (options.seq) {
    rendered += ` (${header.sequence})`
  }
  if (options.prev) {
    rendered += ` prev: ${HashUtils.renderHash(header.previousBlockHash)}`
  }
  if (options.work) {
    rendered += ` work: ${header.work.toString()}`
  }

  if (header.hash.equals(chain.latest.hash)) {
    rendered += ' LATEST'
  }
  if (header.hash.equals(chain.head.hash)) {
    rendered += ' HEAD'
  }
  if (header.hash.equals(chain.genesis.hash)) {
    rendered += ' GENESIS'
  }

  content.push(indent + rendered)

  if (header.sequence === end) {
    return
  }

  const next = await chain.getHeadersAtSequence(header.sequence + 1)
  const children = next.filter((h) => h.previousBlockHash.equals(header.hash))
  const nesting = children.length >= 2

  const indentation = nesting ? options.indent || '' : ''
  indent += last ? indentation : `| ${indentation}`

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    if (seen.has(child.hash)) {
      logger.error(
        `ERROR FOUND LOOPING CHAIN ${header.hash.toString('hex')} -> ${child.hash.toString(
          'hex',
        )}`,
      )
      return
    }

    const last = i === children.length - 1
    const only = children.length === 1
    await renderGraph(chain, child, end, content, options, logger, last, only, indent, seen)

    if (!last) {
      content.push(indent + '')
    }
  }
}

export const serializeRpcTransaction = (
  tx: Transaction,
  serialized?: boolean,
): RpcTransaction => {
  return {
    hash: tx.hash().toString('hex'),
    size: getTransactionSize(tx),
    fee: Number(tx.fee()),
    expiration: tx.expiration(),
    notes: tx.notes.map((note) => ({
      commitment: note.hash().toString('hex'),
      hash: note.hash().toString('hex'),
      serialized: note.serialize().toString('hex'),
    })),
    spends: tx.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    })),
    mints: tx.mints.map((mint) => ({
      id: mint.asset.id().toString('hex'),
      metadata: BufferUtils.toHuman(mint.asset.metadata()),
      name: BufferUtils.toHuman(mint.asset.name()),
      creator: mint.asset.creator().toString('hex'),
      value: mint.value.toString(),
      transferOwnershipTo: mint.transferOwnershipTo?.toString('hex'),
      assetId: mint.asset.id().toString('hex'),
      assetName: mint.asset.name().toString('hex'),
    })),
    burns: tx.burns.map((burn) => ({
      id: burn.assetId.toString('hex'),
      value: burn.value.toString(),
      assetId: burn.assetId.toString('hex'),
      assetName: '',
    })),
    signature: tx.transactionSignature().toString('hex'),
    ...(serialized ? { serialized: tx.serialize().toString('hex') } : {}),
  }
}
