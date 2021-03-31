/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import Blockchain, { Block, GRAPH_ID_NULL } from '../../../captain/anchorChain/blockchain'
import { Graph } from '../../../captain/anchorChain/blockchain/Graph'
import { Transaction } from '../../../captain/anchorChain/strategies'
import { JsonSerializable } from '../../../serde'
import { HashUtils } from '../../../utils'

/**
 * When shown, graph ids are simplified ids for debugging and not their real ids
 */
export async function printGraph<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
>(
  chain: Blockchain<E, H, T, SE, SH, ST>,
  genesisGraph: Graph,
  graph: Graph,
  block: Block<E, H, T, SE, SH, ST>,
  indent: string,
  last: boolean,
  content: string[],
  seen = new Set<string>(),
  simpleGraphIds: { id: number; ids: Map<number, number> } = {
    id: 0,
    ids: new Map<number, number>(),
  },
  show: {
    gph?: boolean
    gphSimple?: boolean
    prev?: boolean
    merge?: boolean
    seq?: boolean
    work?: boolean
    indent?: boolean
  } = {
    seq: true,
    work: true,
  },
): Promise<void> {
  const blockHash = block.header.hash.toString('hex')
  seen.add(blockHash)

  const isLatest = chain.blockHashSerde.equals(block.header.hash, genesisGraph.latestHash)
    ? ' LATEST'
    : ''

  const isHeaviest =
    genesisGraph.heaviestHash &&
    chain.blockHashSerde.equals(block.header.hash, genesisGraph.heaviestHash)
      ? ' HEAVY'
      : ''

  const isTail = chain.blockHashSerde.equals(block.header.hash, genesisGraph.tailHash)
    ? ' TAIL'
    : ''

  const isGenesis = chain.blockHashSerde.equals(
    block.header.hash,
    (await chain.getGenesisHash()) || Buffer.from(''),
  )
    ? ' GENESIS'
    : ''

  const blockString = HashUtils.renderHashHex(blockHash)

  function resolveGraphId(graphId: number): number {
    if (!show.gphSimple) return graphId

    if (!simpleGraphIds.ids.has(graphId)) {
      simpleGraphIds.ids.set(graphId, ++simpleGraphIds.id)
    }

    const simpleId = simpleGraphIds.ids.get(graphId)
    Assert.isNotUndefined(simpleId)
    return simpleId
  }

  // Reduce graphs down to simple integer
  const graphId = resolveGraphId(block.header.graphId)

  const suffixParts = []
  if (show.seq) {
    suffixParts.push(`${block.header.sequence} seq`)
  }
  if (show.prev) {
    suffixParts.push(`prev ${HashUtils.renderHash(block.header.previousBlockHash)}`)
  }
  if (show.gph) {
    suffixParts.push(`gph ${graphId}`)
  }
  if (show.work) {
    suffixParts.push(`work: ${block.header.work.toString()}`)
  }
  if (show.merge) {
    const graph = await chain.getGraph(block.header.graphId)

    if (graph && graph.mergeId !== null) {
      const mergeId = resolveGraphId(graph.mergeId)
      suffixParts.push(`mrg ${mergeId}`)
    }
  }
  const suffix = suffixParts.length ? ` (${suffixParts.join(', ')})` : ''
  const indentation = show.indent ? '  ' : ''

  content.push(
    indent + `+- Block ${blockString}${suffix}${isLatest}${isHeaviest}${isTail}${isGenesis}`,
  )

  indent += last ? `${indentation}` : `| ${indentation}`

  let children = await Promise.all(
    (await chain.getBlockToNext(block.header.hash)).map(async (h) => {
      const block = await chain.getBlock(h)
      if (!block) throw new Error('block was totally not there')

      const graph =
        block.header.graphId === GRAPH_ID_NULL
          ? null
          : await chain.getGraph(block.header.graphId)

      return [block, graph] as [Block<E, H, T, SE, SH, ST>, Graph]
    }),
  )

  children = children.filter(([b, g]) => {
    return b.header.graphId === graph.id || g.mergeId === graph.id
  })

  for (let i = 0; i < children.length; i++) {
    const [child, childGraph] = children[i]
    const childHash = child.header.hash.toString('hex')

    if (seen.has(childHash)) {
      // eslint-disable-next-line no-console
      console.error(`ERROR FOUND LOOPING CHAIN ${blockHash} -> ${childHash}`)
      return
    }

    await printGraph(
      chain,
      genesisGraph,
      childGraph,
      child,
      indent,
      i == children.length - 1,
      content,
      seen,
      simpleGraphIds,
      show,
    )
  }
}

export async function printChain<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
>(
  chain: Blockchain<E, H, T, SE, SH, ST>,
  show: {
    gph?: boolean
    gphSimple?: boolean
    prev?: boolean
    merge?: boolean
    seq?: boolean
    work?: boolean
    indent?: boolean
  } = {
    seq: true,
    work: true,
  },
): Promise<string[]> {
  const content: string[] = []
  const graphs = await chain.graphs.getAllValues()
  const treeStatus = await chain.checkTreeMatchesHeaviest()

  const simpleGraphIds = {
    id: 0,
    ids: new Map<number, number>(),
  }

  for (const graph of graphs) {
    if (graph.mergeId !== null) continue

    content.push(
      '\n======',
      'TAIL',
      graph.tailHash.toString('hex'),
      'HEAVIEST',
      graph.heaviestHash ? graph.heaviestHash.toString('hex') : '---NULL---',
      'LATEST',
      graph.latestHash.toString('hex'),
      'TREES OKAY?',
      treeStatus ? 'TRUE' : 'FALSE',
    )

    const tail = await chain.getBlock(graph.tailHash)
    if (!tail) throw new Error('no tail is bad')

    await printGraph(
      chain,
      graph,
      graph,
      tail,
      '',
      true,
      content,
      undefined,
      simpleGraphIds,
      show,
    )
  }

  return content
}
