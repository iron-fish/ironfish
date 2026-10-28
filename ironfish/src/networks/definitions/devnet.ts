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

// Regenerated for empty-subtree Merkle padding. This starts a new devnet chain.
export const DEVNET_GENESIS = {
  header: {
    sequence: 1,
    previousBlockHash: '0000000000000000000000000000000000000000000000000000000000000000',
    noteCommitment: Buffer.from('CzorLDJDQZqUnOVuh+v/iV8Le+cT6Y97eY5LOTGrGkk=', 'base64'),
    transactionCommitment: Buffer.from(
      '6Fww0jY4AOEOLp5iyFFdUHyKGE57WRsIC96Bhqo/7dA=',
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
      'AgAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1F/Cq0FFndp0bEXHSak9OCA8m/6BOSOa6thbEG6wi72oqI7sxRFfZiT8b55j48MtIusPwfDrNQa92BaJ6+GaOZ16d5kpvbGdSfy708yZJxeC7DysG1KuL+oZwytHTuVxo+RFLi0hlCS2wt+KsrPgwiRT9TR1O8lWmzFYjh7/DxgD3DYOEOjet5XKPITTQwtLY5Hq5StQcVR8p7NL1C45RVRoyQVmYwWGqAosbssSmsOSRptPgEzxJvpH0EPn67MG0ZDOWi77WowxdAkL4caih4e6nc73/7EnrSMJV/ko8D5MkWp5kBM8EMUIO1wp5KG9CmvBQ0spOFUYrpSctIC+qbSA38P7c0/zEyrFlNWRvyJe5apqkQVoRZ6uao22mg0gERomZgueFu8Wepsop4h1Yo+n944uHdrBiJsqclHKKUDKh0eff8Y/+U4k6F0EmMSoPZovxpgd8WMFvixlCehC73oik9Bq4DqMqBcP8s+9W6jZ331qq9syYcvPUHTSF/PCWzXHq12l1+2JZrNL/NqB1TIwnToyEXGjZRlAU3w6lq3IMog2MJRVM/IT2f410+2XufVkjkobUGQn6r/T+Y8W4JFnReLZewC2Una63uIr0ucnEPUkRI8zY0lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwhF50uljkP0CAqRfnyylGC90YpD+T5Uuib9YjBZFId5SpsVSG584IM2fOEOiK6Vxv5n4mAAnZRtXeKaEObGRsBg==',
      'base64',
    ),
    Buffer.from(
      'AgAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAsLLSFxA+1EkfqGLFQKgGDhrlnnY4iCYnSBZwwKcOXwaIDk60c3NL4yLRp7VhYfTU0imrXhl2yoIBtTsp6g3X5GP1gRpHdH2cpdU6JQ7kDzqOJV+hQIcGOIPBWLZRZNYbQ8ylea3dRh7AMnvzNB8ri7fXt63MgT2LtSWS/dlpgD8W+LLBeq1tYMpK5cWsBGVstqOTiriFFkpkr7vAxQMdGxdeyojT4yA0E7lzsCsGX3GRanwGGAbLN+BCgqL5GBIueL/ZXWkaCUa3ct3XdTyztQcrtkTwtRMLMiL9gnidqD5M6Mv8AjurXeIROb1fc2RORN0aOsvo0NBGlrbIPVlLQTAYfzhwLmV8TBlHdRtZeS27BBA3See9h38XL6MtiSAbien4a6PhrjayuGNIXkyIK8tz/UP0hGn7TEb8S9cpQusJesQGwS5liSY1W7yOePeP6uuBL/4q3WbCxLGteYf1ZnhT2qSgMBtVtCYVzWfFU8mBgLJugSadk48g4tsRSZoLsxmgUPifTdWOAQSnl5I1KXV8828gO+z3cYvhbU7K8C7jQZp1fYI22loZ6ijh7qQlj7eDWyuGgyuaRAud6dAVe5GQHCBAIlG6zzq8VPghZ4i6ux5gaYcumUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwG3ja5QdthscVggusZGl+yM+jt9SKvxni3zwgBxF3nZaci8GkU/dA3maLYmy9jy+GkS9TqsopTppEN5lxYARzCw==',
      'base64',
    ),
    Buffer.from(
      'AgEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA48kD1zcnQUrXwXQj+7fWBji7EED7wjNRKQBXaaUVaC6Fclw1NjA2CAHUIIqU1M5NAF1nROdgFjueKi8iWe8PmaHvaeBdXKYxSPz3YCVNaSesQm76PHsbd2xv+pwSsY6eMYj9SCiP7wBZ3oQoY23y1r1dgeQgNXCnnXUSothzI/sEBBg0couFPV3LUNOrsArfMsQ8wnTLfanB6ku2QecLVVnN5aVzmvmcVk5HCZeSZhi2sqtmJ3TcgkFCppFeMMi68qfRVJFi56qXzVmUw8yjt+QLaWeCqU0KsHmEwjUb7DtSHnmhXtWB5XElIcuvsYJH/Lw+cTj4octOLsgeRReJ7XA3qomLNeJOWB/RqnmCoPCHvKP8apEvj4usAw477kZTAgAAAAFRnhsiw3DcUz2D4fIws5V1Svtx7RfidjxnWT4nFU/rG3VXXerxSBAvw6z5iuDhpM4IfocI2u9AoT4nmdu5gOi23SECcS6zpCIOzLt/NaCEkfhY9MTlyCUz6SFQ4+0UC4hgd+3ste7yGZqQoObp8o3aKHOCB43wkK11ED9pSsyd87i5QOMsFdIBm2gu6NqlY5jabh79atbxjmsT0J/F0yfr7h/bbwQ/shUuYMzZBzfp1XUdANd2kuubJsoE+ZO9lQ/AcMW/6D+SfkpSTNcIKlgx7nniYrOs/UAW4v/uTyuD7gZEvh4ggZ5++zYh6O3QoKA7cHtqwf61pgMWPqu+tjphV3JuPGcheijjAy7tBrM20BOk7ST98JtGs34Yy0r2Qbb22JM5c/wZ0iraVWgI2SY/5B38UNcyB//dkW9eLIQKvQ0tPSPHHZSFN7rSYTC4p3VLlIzl40YnsnilB5b/lAaJy2Lo+xRd6dgaCoE/wJE0IP6UC/X/foEtsAlQ/vXdI7wgpglKtqDThRzKE55BbpArUkLPR93yJyK/Nvmr8cS2I4d4eA6Xsw6Oq5Tr+CIu17rDH35zQQMi+w9sowg7IsVFzcoiRK81c2iFOfyZqhlqAhwTHT9VCqF9DsBxnKJ4NM4jKVtGEohk2TIsm4shZ90yls2rE5sMa3MSbYcNQVLT6MCEBm9Bq35Z1kFR+rlc7T+h0ghd1UTc5ck31jXqq5uxQ8vIwU7D4Su7+sAORA+QSIUmFNJmSlMIKpPoQ+fzeB1C+/Gsybk65bvkWQyUA1oEz9TeNbQUV7ISCTUFrVpdNEpXJlXZDzx6vytfpIBN3P6uN+h8QXXVwvrDXAFTWV2PJaiQpWRFuWPJsjEvpRDkBdzwYi56Bg0VgppFRKS/F3XahGc/n4AL',
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
