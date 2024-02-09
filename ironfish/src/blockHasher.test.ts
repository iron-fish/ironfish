/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { blake3 } from '@napi-rs/blake-hash'
import { BlockHasher, serializeHeaderBlake3, serializeHeaderFishHash } from './blockHasher'
import { Consensus } from './consensus'
import { Target } from './primitives'
import { RawBlockHeader } from './primitives/blockheader'
import { FISH_HASH_CONTEXT } from './testUtilities'

const consensusParameters = {
  allowedBlockFutureSeconds: 15,
  genesisSupplyInIron: 42000000,
  targetBlockTimeInSeconds: 60,
  targetBucketTimeInSeconds: 10,
  maxBlockSizeBytes: 524288,
  minFee: 0,
  enableAssetOwnership: 1,
  enforceSequentialBlockTime: 1,
  enableFishHash: 100001,
  enableIncreasedDifficultyChange: 100001,
  checkpoints: [],
}

describe('Hashes blocks with correct hashing algorithm', () => {
  let blockHasher: BlockHasher

  beforeAll(() => {
    const modifiedConsensus = new Consensus(consensusParameters)
    blockHasher = new BlockHasher({
      consensus: modifiedConsensus,
      context: FISH_HASH_CONTEXT,
    })
  })

  const rawHeaderFields = {
    previousBlockHash: Buffer.alloc(32, 'previous'),
    noteCommitment: Buffer.alloc(32, 'header'),
    transactionCommitment: Buffer.alloc(32, 'transactionRoot'),
    target: new Target(17),
    randomness: BigInt(25),
    timestamp: new Date(1598467858637),
    graffiti: Buffer.alloc(32, 'graffiti'),
  }

  it('Hashes block headers with blake3 before the activation sequence', () => {
    const rawHeader = {
      ...rawHeaderFields,
      sequence: consensusParameters.enableFishHash - 1,
    }
    const hash = blockHasher.hashHeader(rawHeader)

    expect(hash.equals(blake3(serializeHeaderBlake3(rawHeader)))).toBe(true)

    expect(hash.equals(blake3(serializeHeaderFishHash(rawHeader)))).toBe(false)
    expect(hash.equals(FISH_HASH_CONTEXT.hash(serializeHeaderBlake3(rawHeader)))).toBe(false)
    expect(hash.equals(FISH_HASH_CONTEXT.hash(serializeHeaderFishHash(rawHeader)))).toBe(false)
  })

  it('Hashes block headers with FishHash after the activation sequence', () => {
    const rawHeader = {
      ...rawHeaderFields,
      sequence: consensusParameters.enableFishHash,
    }
    const hash = blockHasher.hashHeader(rawHeader)

    expect(hash.equals(FISH_HASH_CONTEXT.hash(serializeHeaderFishHash(rawHeader)))).toBe(true)

    expect(hash.equals(FISH_HASH_CONTEXT.hash(serializeHeaderBlake3(rawHeader)))).toBe(false)
    expect(hash.equals(blake3(serializeHeaderFishHash(rawHeader)))).toBe(false)
    expect(hash.equals(blake3(serializeHeaderBlake3(rawHeader)))).toBe(false)
  })

  it('Puts graffiti in front of serialized block header for FishHash', () => {
    const rawHeader = {
      ...rawHeaderFields,
      sequence: consensusParameters.enableFishHash,
    }

    const serialized = serializeHeaderFishHash(rawHeader)
    expect(serialized.toString('hex', 0, 32)).toEqual(rawHeader.graffiti.toString('hex'))
  })

  it('Hashes existing mainnet blocks correctly', () => {
    const block500: RawBlockHeader = {
      sequence: 500,
      previousBlockHash: Buffer.from(
        '000000000000005a307332b6910b730347c1849e4f7772d0c30cf251f7a231b8',
        'hex',
      ),
      timestamp: new Date(1682046624440),
      graffiti: Buffer.from(
        '6865726f6d696e6572732e636f6d20575053474a35796a50500702023eb36ed2',
        'hex',
      ),
      noteCommitment: Buffer.from(
        '365b8d520119591d4adda9a43586732151759bcbab2663dc810df6b479a08557',
        'hex',
      ),
      transactionCommitment: Buffer.from(
        'fd54b5407c50c45114bc36bc18c6093015f3edd614fff12c4871f02011a2a3cc',
        'hex',
      ),
      target: new Target(756384800508438608204615908259480917815960905158618695086860n),
      randomness: 2734524376649158465n,
    }

    const block10000: RawBlockHeader = {
      sequence: 10000,
      previousBlockHash: Buffer.from(
        '000000000000001918ec5e350ec40d3606c865c162439bf1faebf9c23c4689ad',
        'hex',
      ),
      timestamp: new Date(1682604438528),
      graffiti: Buffer.from(
        '0000000000000000000000000000000000000000000000008308423f00000000',
        'hex',
      ),
      noteCommitment: Buffer.from(
        'a6ada17d6dfa066198030403d4b6160633a7064843bd7c7124d9669069c9666b',
        'hex',
      ),
      transactionCommitment: Buffer.from(
        'a8f937d95020a51c7f7ecf7157d330ee146aeb6cbd4fcce4a42e80db4f6a1f4e',
        'hex',
      ),
      target: new Target(429471422073515230604015821651699605609508434072272216389555n),
      randomness: 2459773558139518993n,
    }

    const block100000: RawBlockHeader = {
      sequence: 100000,
      previousBlockHash: Buffer.from(
        '00000000000000726356321bf7c2057feaeaeba771cf997ac6f13038b7fdf9ab',
        'hex',
      ),
      timestamp: new Date(1687943221494),
      graffiti: Buffer.from(
        '00000000000000000000000000000000a0b0d100000000000000000023000000',
        'hex',
      ),
      noteCommitment: Buffer.from(
        '9094c2534f0ee3ae7ed078a3811e2b6de47094f9d710e2ae26ed00e038653819',
        'hex',
      ),
      transactionCommitment: Buffer.from(
        '97c767928661a813038a44306fd3a5b050ed685c5584d739e0c1833c0123f792',
        'hex',
      ),
      target: new Target(946788478496387895228612647492461330784782254609709025541178n),
      randomness: 50540119513756614n,
    }

    expect(blockHasher.hashHeader(block500).toString('hex')).toEqual(
      '0000000000000032a29b02858a9d22312e1bf7d15bc6c8e36215b0c79b76ab5b',
    )

    expect(blockHasher.hashHeader(block10000).toString('hex')).toEqual(
      '0000000000000038cf8ac6f148f2c5edae32b5238c9f0ef53e6fe0aa4cc68043',
    )

    expect(blockHasher.hashHeader(block100000).toString('hex')).toEqual(
      '000000000000003eb2e4dfacbcc93079415a784bd7e0887f3375679b2dea7713',
    )
  })
})
