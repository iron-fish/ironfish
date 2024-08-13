/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NetworkDefinition } from '../networkDefinition'
import { ConsensusParameters } from '../../consensus'

const EVMNET_CONSENSUS: ConsensusParameters = {
  allowedBlockFutureSeconds: 15,
  genesisSupplyInIron: 42000000,
  targetBlockTimeInSeconds: 60,
  targetBucketTimeInSeconds: 10,
  maxBlockSizeBytes: 524288,
  minFee: 0,
  enableAssetOwnership: null,
  enableEvmDescriptions: 2,
  enforceSequentialBlockTime: 1,
  enableFishHash: null,
  enableIncreasedDifficultyChange: null,
  checkpoints: [],
}

export const EVMNET_GENESIS = {
  header: {
    sequence: 1,
    previousBlockHash: '0000000000000000000000000000000000000000000000000000000000000000',
    noteCommitment: Buffer.from('YtUTo+FsionXC9toFJnaBmZtDcFFCNdLEgXCkRrPp1o=', 'base64'),
    transactionCommitment: Buffer.from(
      'ROwX6C2qfZfbbhI1FilKLEK+/hR84lyjeKts8+o0lBE=',
      'base64',
    ),
    target: '8834235323891921647916487503714592579137419484378094790608031006463098',
    randomness: '0',
    timestamp: 1723581045134,
    graffiti: '67656E6573697300000000000000000000000000000000000000000000000000',
    noteSize: 3,
    work: '0',
  },
  transactions: [
    Buffer.from(
      'AgAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA5om1TwFFRFp6zYTg0BN7ZjXRfmHmByxehzyUmTyRKuH74avBRbS8is2/YnL6Jg1zEjHuXCAlhKIrRlCwocR4yh1rvusRXKoLEYuhLSYUZaPJ9uF5oJnEZEImkEHhxbggL3PP7SIGSarQsrOeMoMAkMCPVt9QYswC4ILxRTCNDcWfg5tBhlN3Az1M5+l6pQGVOJWTvr6ssfTg4mv8QqEXUwvfoXdfi9IaMAL9L/PBSuO9+1+8Kup+Il9NJdG+RzOVseNtp19Xp9tvbKUvETo5l83NcvBAT5IjAH+4m8FYx1biUE/CDemvdHqNXSuDC7J+OKLvtj/TTRtMfADfrnTFsENYw/qR27Po2b4pRR5Cdp0u5lbJQQCs7LALL7aeRIPaT5pmuPS+LFA9hqzsrR6e/jIXxclKU204+bV3MV1UYF62OP9WyiJ8r/zCHw/MrMAN0F7uAr0SUZ95wJzHNUQSNsuLh/7gWjHJgMzUsCVB+L822oxv2N4D55uAyKlhbspTKEAF0AEuK+LRfE4E2csNhfeNqkuRHf6VXA3/ylg0fb43VnoDCgGkSCel2e9v8N+yiDD0miqYFolquWkl3FtS+pkfDzMMl/UlUJsVKkWTjujDC8kT/Z2q0lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwzbGMnACTB4UxBoZA3wT1DTbkSrtfg9y3gZPeFZARUKVua2z+6May4dgfZR7V3gxcIE0Rmv8duNR5OR5L0Mm3CQ==',
      'base64',
    ),
    Buffer.from(
      'AgAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAaxv92oKiSZkzZ/LvcoETTyiXNcY16usRctpMG73fhz6RGsF6TFyp8xjAZ46NvdwiuMnD8pip4B7chGpEEMQCrAHD3gUlBogt4w0oMvIFTq+zoKseOLcjTOCKPlfhEViyFjkCp6t86WQNknAB8z6vL/uF/I/qR3nm/636YKVWbFsU7zBKx/lz5E18ClBuQgn7W17UnfJK09hjusgrPK2K1uoXoyrUba3ScyWOSzwT8ry1ciazMfiLVnClRAsDUEwjHvuHh9CxesqrorwfO4uvgPfvr2+wJEZ/lUCqg1BciXrR/WeQeKRwDyBW32FP5ayFZLfUgvw7PLOUgjVcxQp/BaB+eTXjgFZNmAwkyGk9rAcZhDoF3DYVnZvvFGcLNpoXthx1EcX5VEItsySjBrDpiKSwuxVk15RUEpnoGwh03e/eCbeLsv0BpsaaUFogkGP5J8Chb2EN/XeV67B91PHdHjDl8b5+f9xLojWAQbDbiuvSX2Ham2J2pEGDJ4z3Q4LkGP7ZA4+YkbnU7PzQCgIRkRCURlt4hiGUHKja1r9sYVTPCANBJTlLzOU9GPbKMufbypyPdq2WVNkma2FqBtmzgM5Kzi5kpRrmVmMvZI3T4syAqGnklt4xVklyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwj9GoCrW4ZkpTyEoN4k7sbUgvNMdXy+HMEL3tvU23NJDPTMpwQfPr6emQrkhTYO8nYxaaftRJLZWo9AV8Ens8AA==',
      'base64',
    ),
    Buffer.from(
      'AgEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAkZEaRf/qETClme8cEF7cBhrDbkIl554Bz/64n++Td+WTdcWJXQDD5dm+JQVNSwhq6e4Uc8LeYlbrkDifZYJUUS8lnybrE/OImiFvmQBNCHyAJNpMko8VwhjJJVwcGiSDYZvVSyxlrVxJQP29p1lSuWdYHET91bp7EVw2ZSoEzFYBueVUbICxudsADnGeOdvkzfsS24Pb2+sYUUW2p2484mrD9gxlXVHlxJdui/OG22+T2dSTZr9gMx3KIVfLAZDwtao/dKMEWu6fEpzzfWwqE90LgWC4JFAWCv7Me1Ljj7cVkZUQ63CXqQbwCOgK3dZNzpT4kleD7+7l45P6chdCw9Mho2a/yzqlFzDM2av9Xv/+zI3lTOcIShA331KdLtICAgAAAOLgX+J5vJsYW2ZMgiHRornoUDdtV4LukAmFQObZsr4yQT28xnGLjtTA5zmn/+HxRPMcbYk8lsxf0gOJt+fAD7ZW+T1DXnm0EA1U2uursa5KXPJBAyzwoUSWu0z2VInfDIdbqXiHnSyoPqe9WLwpUl5yiBsxz2VaWM/ZsI8PaTZ7X+bBV+Q/iDWOVfl1dUyAKrfepBKHmyWp4xp1ZydY/8r2Fnagw423LudFpaJCxwQU+phL2irvAks1D5FihN6E6w93GdhbNvRWiuThX8oLk6pOg/Yv1y0ZHAULdmD8DVFZfo//adt2DUnQkvTfcuzzzrEhldPRKlLoAx4paVSi2J1+PQz+S7GswQspbtShj0b42wt3LvlpECw5Cq6NBBsu2tOCENLSdmEz/yn0EKZ6OADiq5RinmPn5N4jYk0AwbBeKH2UXJZfQNryBFNEEB1UBBMEU2wyHhqy/46I4DlKBTNefI/M6MFKJIQsYSN2fHf4iZNcZa/srXycZkyPkeAC60WJ+KHhg7RNfK4lE+lArfUVqGiFoysqiS7H8tAzr4P2l5IcvkKLHD8mPuAqvb4Sb5Wh+Slf1yak1Lt0NoaWF5WJpl/oplkMQ//qKvGEJe3wcFx1W8igeJAOq0f1E6rc0B1THGcW38gLCAOJqGlL6MxeP461eBFSD0QD0BcXTlmTarAFcjpDyaB3n+tbl0gcuFpoGb9sGnWZjZlOJ03pxyyj3PJ7lo+IP9xJuBY1lb1y5iCmZr4nSX+EhEQUEbNR7hOcyX4IJHMTIH6fIW7vAPa790q6YiXTqWZj9q/WpWMeeXnLrjM8ybHDIutCupPXe8qRy7fXQ23bv0+tDiOhRdz2fQy0HrPeMjQDo9ZyCRTokmiEucln5/4dnPNWKlnbaki5PDteWZII',
      'base64',
    ),
  ],
}

/**
 * This account (IronFishGenesisAccount) can be imported to access the funds in the genesis block.
 */
export const EVM_GENESIS_ACCOUNT = {
  version: 4,
  name: 'IronFishGenesisAccount',
  viewKey:
    '1b2fd7f0c575e3e07f6a6e5a6332ead32aabfc34dd0db5bab3ce0dc45027516aec3ef0a7e74996584c3b288c58a6e3dfc5092b1a59bf212383f8e9273a3a516b',
  incomingViewKey: '9a247f02eb802b3c9c7d6f04c482c0753d4fd4975b3cb93a2de832e48b988d03',
  outgoingViewKey: '8a1497da876619e2207ca1a874aaeda533e5da12ce819e2b15ba1f39bb89db57',
  publicAddress: '12fb8527e1fda8e2d257f04fa9ab91e41e8dd0cd8811c6592a946eda194111ed',
  spendingKey: '5da1bf7b193e346341a123170152094622a0421fd3b89532b73639760e74aae9',
  proofAuthorizingKey: '411c826b23ec1a67f4e67e34e7c4250f937e09325118bea5e7aa5d216f63750b',
  createdAt: null,
}

export const EVMNET: NetworkDefinition = {
  id: 3,
  bootstrapNodes: [],
  genesis: EVMNET_GENESIS,
  consensus: EVMNET_CONSENSUS,
}
