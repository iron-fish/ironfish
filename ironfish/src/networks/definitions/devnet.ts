/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NetworkDefinition } from '../networkDefinition'
import { ConsensusParameters } from '../../consensus'

const DEVNET_CONSENSUS: ConsensusParameters = {
  allowedBlockFutureSeconds: 15,
  genesisSupplyInIron: 42000000,
  targetBlockTimeInSeconds: 60,
  targetBucketTimeInSeconds: 10,
  maxBlockSizeBytes: 524288,
  minFee: 0,
  enableAssetOwnership: null,
  enforceSequentialBlockTime: 1,
  enableFishHash: null,
  enableIncreasedDifficultyChange: null,
  checkpoints: [],
}

export const DEVNET_GENESIS = {
  header: {
    sequence: 1,
    previousBlockHash: '0000000000000000000000000000000000000000000000000000000000000000',
    noteCommitment: Buffer.from('5p5u9078VaK/SwZxf0PK5GL03yEGIuY9rY+3rTD5NxE=', 'base64'),
    transactionCommitment: Buffer.from(
      'J42IwDCgpNSWDJcr5edUlUIzchlAN8HIt7PGx1Uy+EQ=',
      'base64',
    ),
    target: '8834235323891921647916487503714592579137419484378094790608031006463098',
    randomness: '0',
    timestamp: 1681339461513,
    graffiti: '67656E6573697300000000000000000000000000000000000000000000000000',
    noteSize: 3,
    work: '0',
  },
  transactions: [
    Buffer.from(
      'AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQW7gJjQzYQCa3al+kgmH1KTeynWVlOayM3JUtxu7rsWSd28lOcqIrQQzDgn2b9OoLuzl/g3Qty03F6y2p+mEuAQANXdoHFyYyUL05fI6U9atNL07ZEm3VvCEErKpw65aM2RzNKzVV5qBnZyHfMUWsQ1gPgehQfqn3VfWcxZkzLANSDGD73MApt9r+3n8YVf6SwWaLdVP+AtOr4macd16HTf1Co7WE7ikuqXERiBV1TO0vgY4mgrQ7aDkQgPFH50Q9FFKzzFpAk9/8lYTrTEqoVg5DGbUUMkgaMQigvsPC3yofPKx6koutv2rHhWmcBoSnTE6I3Rgk4oG9tZAb0FQr5HglyMwDnceXf1QPs3BabZKi6QOkHDd80WxAdEu1mNxXqw9IzUdIisDy+hz4R7c2h/BS4+2AXr7iNvG/ldJRLP+S0JFS9AA+RjLiCaXn8yGLdd8jitVVk0mpBoAcPdM2zkTK88g22GwRGw/ToUMFaGSFQZzGVoSX9KhQ6s6o5hr1NlMJ/mi1eU9qaB9dW3xdZNb7S2dJ5va7Qg6eELSMTnDgrt5xzU+Iry9RzlK9OvG/hgR3LgdyGonRhfeYEDjy5SAtY+Vs63HErRxaU2nal1wh2CmNYxB00lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwfiKudpqWQQN1ak3i9Ka7idxy9LCulG+28RvJYgLZLpCI9pJJCuOuvL2QGolxOj/Gtq4oO+gRRs2a5JscPosLCA==',
      'base64',
    ),
    Buffer.from(
      'AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAhFOC1mptRfRELktTeyCEaaP0BkGhP161IG3FI8ywMhykaUPTW10Ss2jb8Qx0rq35kAsqkYZ5K7cc72/wJKHKR/x0se6Jzpp6RlcZKb3XxMWpQBmmZHRkHe0OM5h2hPGgqE0ZYayknyVGzpB0Rdj/jw2UL3b/Ffk5Zdn9o7aRVa4TlJnJMhOepi3m0a/OKhT3radcOZupegcyYn08QMN4LpwCBIEMsJTqGZkwS0ij0Ku2+oDxjYTegdrfW6FlYZo8bmz/XoAEtkKf0y/A9rq4Nd14ngOv8Oq/KROaYd4X7J8N2zZLJrLmVDZIv+5l1bbMrOKg6QRuALyUll6LON4PuVovFwmQThSB9W2g7ZOQUaRZQxhL38Jd6UtQE/Qp4VRCblLiNrXRZSwbAbtDBNBvQQ22XZXoaaeuE0tQFlP6Hs0DtNjgPAJYguhCQra9S/DF4YUqPuGnUU/FpzAbGafcisEqbYFWz1Lh5iebLh6vwxrKAezDObneWX+GrqvFQZ5oOzFlahaT6M7HMronPZQAIroDy1YQhpewEMCxpjKKx8/UzQWvEoAdoqI4fh0Ub72QfjD4R0Qug3apBuJR1at2rQ7NyfHjGzEufqLC4Ao8wzpEKn7inled10lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwGVl7k+wkrof1kCF/C5ahwrax4ypdCTcQhnx4vDMIg2Vcyj/AnRjpbl7rNmY4Bj2RVXy5bdnxkXOyblVb4a3JBg==',
      'base64',
    ),
    Buffer.from(
      'AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARsrfU0RzXO/eeSJSAd6HLPumQUEzyTxzrVRXNAGPtlCRw3wTbL/B5OZ6jAO7S1Ey798uVdDU73YcXvF09QH7h7gQNVKfg/WCxduhcrsv6eSZ9fz7bIz+ObjHJUyHjiOMt/N1JRSBL3CKdvNrbmjOJiLsnF5L+GEpYfVRogizOzkMTveMcmNassZl5y1fc46D40j0Yf0EMLcltMW9kKxFnlDsUYQ9J3ojWXIfE/p4/Du1AeRRcrr114R47suYQ7kD+y7VxGXifsBr4gBXFmHB1AH8jyQi39G5P9EE9yahIbjnqZNcV+BOJPTkkAC0k8rnzJpJ4m5G7l0hOoe/2UkqB649jzmjKLgpUpWJWhb4uuY78SKJr5h7GdNdGKWEMJFMAgAAAPssoI0JKTqWW04i7gnK7w0moNoySs8YeBFOv5Tl27md+/1XaagdIS5akh93IvZwpiaDYcjNK59lydGktYs05s+uoMxWWIIf9S7u73HFfWKBntiOhjFvjeEiaeKrnN8tC7SuUD8c/jVXuEIIrw+rdnXp5tTVzGPCogFYtBOQ2w1QG9JpglAern7NHdCvDuEijLjz2K8QWgymShn7VbXFpuTYRwuwsboVJkAjj6DwgqbGcroI1G0rGY/u+2toTWnvZhY6WCsepEW+sjWt8rb7ENaQ5QiVQHzXHWqg2amxSNrB4JMXO3d9ifW8Pt4CWSfBmYwAk+7wiqTYlurzIe3tUVF/BQBavIoIEICPOGUEwmv3/V108NtBQw5BkWdZTZm7VpYDhSkDmGSWYzLzl1o+e5hSBkYGMD3m8L0v14KA51pqaT5708H9FWx68nVINHAYDBzry5L8C8c4BYFcjXFKeXFUDeZSduwLJCa6oZwRwNNQUQcO8Sh0IVD/i1fWwMcYsVOahlGgQMBtP/K53D1n4hlIvSvWvn02gRlkhtWfErdlEVeOsfilNj6Nm624eQpaIX+xHS2WCj7+zHsnMuyzCG0BQMt6O4JgNcoNFwUwEVArlNWIx52edQ5antuPPaxz+62owK3KRgNvrIA25A+bQ6+Gy1sW+6XccrX5y24xQXewSl2zmh5D/JcJLdQc0V+NRhREIoamLJBorO+PVZeUZH973JxhowZW8c0Vago5uY0UnrQinGKa/Ejj189paZ/knFDgAErLn6EVWkJP3Zthxo0t7qJ04GQLPkxvFKwThkj8gkU6cXx5cm/9phFb8vN47NeGOyqM42FErkFTUFVQkESp07n2e72eBuhccYH7mrqv2rbV9IrTaUR8NKAHK2AvDcVSJcSkrVsE',
      'base64',
    ),
  ],
}

/**
 * This account (IronFishGenesisAccount) can be imported to access the funds in the genesis block.
 *
 * If the dev genesis block is ever regenerated, this account will need to be updated.
 */
export const DEV_GENESIS_ACCOUNT = {
  version: 2,
  name: 'IronFishGenesisAccount',
  spendingKey: '2abe405e7110640e0e7bdedc95f1df14bd425df1cb8d87e88c9d4fce7bf89d40',
  viewKey:
    '689634cf4d97c7472c3fc861877caf27e6be48220111db840c066b7ba70f60e5f92bc747bc388d5b39c261a977416e9e1f432a6db317237ea89c8a16ef1eea9c',
  incomingViewKey: '6b776d2263a72c5a525b0c23f6b58b8d588f5245dde52128a6da081083a72a03',
  outgoingViewKey: '61ffa2d35d1dba8d3231695efe4747b3bedc9f4ac642e63d4626a49c0b0076fa',
  publicAddress: '561cd548332724ac284e56044dcb0882b21aa408a320a850d77ac1aad64ad6b4',
  createdAt: null,
}

// TODO(IFL-1523): Update proper activation sequence for enableAssetOwnership
export const DEVNET: NetworkDefinition = {
  id: 2,
  bootstrapNodes: [],
  genesis: DEVNET_GENESIS,
  consensus: DEVNET_CONSENSUS,
}
