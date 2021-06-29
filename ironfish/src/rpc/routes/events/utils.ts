/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferSet } from 'buffer-map'
import { Assert } from '../../../assert'
import { Blockchain } from '../../../blockchain'
import { createRootLogger, Logger } from '../../../logger'
import { BlockHeader } from '../../../primitives/blockheader'
import { Transaction } from '../../../primitives/transaction'
import { JsonSerializable } from '../../../serde'
import { HashUtils } from '../../../utils'

const DEFAULT_OPTIONS = {
  height: true,
  work: true,
  indent: '|',
}

export async function logChain<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST,
>(
  chain: Blockchain<E, H, T, SE, SH, ST>,
  start?: number | null,
  end?: number | null,
  options: {
    prev?: boolean
    merge?: boolean
    height?: boolean
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

export async function renderChain<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST,
>(
  chain: Blockchain<E, H, T, SE, SH, ST>,
  start?: number | null,
  end?: number | null,
  options: {
    prev?: boolean
    height?: boolean
    work?: boolean
    indent?: string
  } = DEFAULT_OPTIONS,
  logger = createRootLogger(),
): Promise<string[]> {
  const content: string[] = []

  const trees = chain.head
    ? await chain.verifier.blockMatchesTrees(chain.head)
    : { valid: true, reason: null }

  content.push(
    '======',
    `GENESIS: ${chain.genesis.hash.toString('hex') || '-'}`,
    `HEAD:    ${chain.head.hash.toString('hex') || '-'}`,
    `LATEST:  ${chain.latest.hash.toString('hex') || '-'}`,
    `TREES:   ${trees.valid ? 'OK' : `ERROR: ${String(trees.reason)}`}`,
    '======',
  )

  start = start || chain.genesis.height
  end = end || chain.latest.height

  const roots = await chain.getHeadersAtHeight(start)

  for (const root of roots) {
    await renderGraph(chain, root, end, content, options, logger)
  }

  return content
}

export async function renderGraph<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST,
>(
  chain: Blockchain<E, H, T, SE, SH, ST>,
  header: BlockHeader<E, H, T, SE, SH, ST>,
  end: number,
  content: string[],
  options: {
    prev?: boolean
    height?: boolean
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

  if (options.height) {
    rendered += ` (${header.height})`
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

  if (header.height === end) {
    return
  }

  const next = await chain.getHeadersAtHeight(header.height + 1)
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
