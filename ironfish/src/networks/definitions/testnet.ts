/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NetworkDefinition } from '../networkDefinition'
import { ConsensusParameters } from '../../consensus'

const HARDFORK_1_ACTIVATION_TESTNET = 419_193

const TESTNET_CONSENSUS: ConsensusParameters = {
  allowedBlockFutureSeconds: 15,
  genesisSupplyInIron: 42000000,
  targetBlockTimeInSeconds: 60,
  targetBucketTimeInSeconds: 10,
  maxBlockSizeBytes: 524288,
  minFee: 1,
  enableAssetOwnership: null,
  enforceSequentialBlockTime: HARDFORK_1_ACTIVATION_TESTNET,
  enableFishHash: HARDFORK_1_ACTIVATION_TESTNET,
  enableIncreasedDifficultyChange: HARDFORK_1_ACTIVATION_TESTNET,
  checkpoints: [
    {
      sequence: 419193,
      hash: '0000000002ee166a1ffe9ae5402ed7eae3be254f38f1d9f3d285b11007847d7d',
    },
  ],
}

export const TESTNET_GENESIS = {
  header: {
    sequence: 1,
    previousBlockHash: '0000000000000000000000000000000000000000000000000000000000000000',
    noteCommitment: Buffer.from('Dakcg1h1FK+DnZMH9y2LyqQKCo/N9AvJZHZM8KmeBBo=', 'base64'),
    transactionCommitment: Buffer.from(
      'muDZr1KNyDyRAotRotwv9kDPAZW0Pl3jHVZLlKlHWbc=',
      'base64',
    ),
    target: '883423532389192164791648750371459257913741948437809479060803100646309888',
    randomness: '0',
    timestamp: 1682450615845,
    graffiti: '67656E6573697300000000000000000000000000000000000000000000000000',
    noteSize: 3,
    work: '0',
  },
  transactions: [
    Buffer.from(
      'AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIZUFsEBy75DHERvMUoYFnuIrffQDF2Ao/EUafurEQmOy6F6F9ngsxlCQANtoxgyCSXthiOuv+thHLXg6QIfeJBb0/7uFimGu+XD253d7LaqktrTcPCwk7ruie4ybh4XAyiTb9QtlNPkYpZ/GIhv66vBw9VpDp3kFncjwvNhAO5gNWANJaFRFDquWoYjR77eZoEANbJWLgLmuaOmLoCWF7wUaG+qYeMMjbWOEauRirb6Y2mRnr093H5AZHqg4CJER5CxjLNhdIttCS9HH6psGtxRs/o145LxDTayXEpiRtpJOt+3bRyAQFuTri34QJamHsVapsHsy3Tb2ZJEBWnHtiX1U+yzTSWUpbV4t6xRA57sYuS12Jw1hfbmOBrGBrG0MmO/xEDLZ8W2SxtUs1g2rr2huOJqqFMJ53dSI64ZYVcUj7swIBB7EP2M40caN9NftCMBsIG1b47kDwPnG7OU05mNaBLe+Bgemk6qJdLJGqoA2oaX7w37drLs3wsSxbSBFYI4wmGtpIvg2+nSwYrRbDuaFMATu8uWTc6ttWCOjEHWUbs2osAf6T35UAjSHJqi5R+AEPJ8QidPP1oJwyPuy9Uj/wHw6Pe6E5aGURoV5oP1vQw5kiUI1rElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwcg3VL+yOt4gcM2fe22cNjf1MSkxJZUuujETHOEquZtCjLnESOgtLyOpsLezPCelDwe3k3R3LcL3aRvc10EriCA==',
      'base64',
    ),
    Buffer.from(
      'AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAACGNrCDAjNzqIkuYQ9xm9SayjrTaBVqS8bdthlQ7IPAC0zlc6jNzsytnuEknXPTl6o8FXGV1x6evdm9JLzmGMwZJz8HHrbB3Jiv1rewYTJY6JMgjsCtScqPctKnNKs77qOo9gS2OzhlJUwsap2AsCbr+bJhkQPlG1KA0JriyMXPMFYG+on6Ts9ZMr7OGM4ZQ1gGqYwYmbPOieH4zXb1r1Tzvw0wO8+xIHize0R2xLaa6pxpaVtsgfUUvCXFxzy8YQbOzfr5pPTkOIgmsssb6Fk2GbryUgB0decNFbR7C1wfaVVyynig2jdZtmwP3Zfi6pu96m+Ei5bDm55BMgUu2/HIJaAFUbnSEjk50DuB5XWuvqyT3289daK42npj5ol4NoJeMXZ/ZALvnzpZ/JZv82sNUYpvBIteauFH6zKTsZQQmvmcQ53Tb/uJ4GR9LKkuzhyZnBcpQ2x4Ehl+zBJAJZL5vx22+hyKsXn8TCjl9aMnoGEre7oE4lDakh9BIpSYuxA8ioknZE9A0dENyYlc3ZTjPpr36KM+3ZF6Z5wfnqt5bAd8dMOVF5y0tzuwOoaKJr0c0fbN1iOWXJermJXW1CfFLdZhEBUhYgfB+p1GKY5dbiFrXbtOtOFElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwsYDcSUfgdX37jVIMJLzx321ORNMNnLbQpfk1CP2LnUyHkDJn7L/Irl4eCCYyE9DlSIJt1UUObofgVRSHqo7dCw==',
      'base64',
    ),
    Buffer.from(
      'AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQgzcr/89L7BWlG7YeUHXFWhEIEO26u+Eq/zvTvhOWoqjgPK8uHkmFsHI2tCKXZyjxf5n7fuQb+sJM4YpKr4CAlbJi+6ThhzpCR0tt1XPPGetUzQ9f1LdnTWpo249ORoYpYHkuvqqJXYvxR3c7XXO8Zlj58UzWkYyNEFqTau2w5kO4r1FXBlqw390IMn3WKNSRGRncVk6aZDXrK2efT9TJAjgxQESZgvNHdH5e8qa17GG6hVglbxgZlniws7UPqIWbMqkztSRJsEGHJH/uC7V0cdnBKjRvxZM59WSwXxMsUJS1TkBDUZlHoBlcKtuZ3OsPS4e8ABD9qmwkqslthqfLm0xgYWfVXv0bKs19uUbJm1J0kq4QpHnzRr1DX20ktEhAgAAALFi3netrDsa0N+6d9vbZGunB/mXamLGMy8uey/p8QtcbM9enziV+ZEdS5EsWKp1CZwUBBdKCuRvzjaEd54RHAK3gM0KYle0i3NF5YVjz8IoBwQ428RZ92i0iFOa2LuYCrLZcW1fVWiQOPFk5KuUgkul7odK0y+1ENCP6DA8MJdkbRJ7FZaDq/WurCpXdNAJTbgEyS97McqC7A208WbDrAGaCgAeLg30TKXm1cM9L9w/V4wLd46wbcRvESYGvvYbYxJUp57GHRdq2EzQtSKMcGeoIAlFgx1sEFnkzL0A8EGnoINlfVlqtL/ebGJ4tZ2e0a+mBr5Hsz4Ge/UWXsSnZW1Nm1pcw16EAH0CBCG0fIxg6mM6DrvUdlswE+vrjqfvlCFB0ulnO2hJq30QXeFAC7BpoeJnAL8m/aIMSJ54BiwKUHDO3LYX8xyE56Q5TTQqq59We4NYWzkSybkZMVf0mD+vwQtfuncYPftrkv0ihcJEbcxxSIeEjcfwlv3D7EcyorKWFRtFb/fvzzzxogavqIiZHGqOsd/HtW0GnOrV1h077dWFsXwflYWKaI4CEG0fcmpQN/JnaDOj2jjX9SAQbiVx+dym0K0vaCO1OFjPpQlwsQUwdhcz3RXuwoecqKOv9okM/bP5IV1BvPdppG2CiM+ZHvO+JCKtc8z4a3C46bzFbIIYNeh50Dwwp9SG2CeYREF0BPOJ2T6TzNhEt3ngZHkHMSgdWwxX6whJFpZpWpas7X8SgD728aQ/QcCZCnPU6gN1zV38MTw5TO+L2UYtrsXPaYV+iPHjLJz3ARKGhf2O22VD1T9/Ta0K1XvZvm4JKHQQAnr7JCaex4nudfj/apMHi9ZY3eJvst1RBg1ZQAjJo6tDvwv1d1VvHKzxU1dPvjkkFc3uYrAD',
      'base64',
    ),
  ],
}

export const TESTNET: NetworkDefinition = {
  id: 0,
  bootstrapNodes: ['1.test.bn.ironfish.network', '2.test.bn.ironfish.network'],
  genesis: TESTNET_GENESIS,
  consensus: TESTNET_CONSENSUS,
}
