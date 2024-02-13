/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NetworkDefinition } from '../networkDefinition'
import { ConsensusParameters } from '../../consensus'

const FISHNET_CONSENSUS: ConsensusParameters = {
  allowedBlockFutureSeconds: 15,
  genesisSupplyInIron: 42000000,
  targetBlockTimeInSeconds: 60,
  targetBucketTimeInSeconds: 10,
  maxBlockSizeBytes: 524288,
  minFee: 0,
  enableAssetOwnership: 1,
  enforceSequentialBlockTime: 1,
  enableFishHash: 1,
}

export const FISHNET_GENESIS = {
  header: {
    sequence: 1,
    previousBlockHash: '0000000000000000000000000000000000000000000000000000000000000000',
    noteCommitment: Buffer.from('IS0TpfkRzkPXewz7+CRYvCDslWPDcr3s8ReILMD2rh0=', 'base64'),
    transactionCommitment: Buffer.from(
      'zeHrOxlq5CiGWJePaHmFwmtaNyBAY+Q3X6z4AiOWZpI=',
      'base64',
    ),
    target: '8834235323891921647916487503714592579137419484378094790608031006463098',
    randomness: '0',
    timestamp: 1707847481238,
    graffiti: '67656E6573697300000000000000000000000000000000000000000000000000',
    noteSize: 3,
    work: '0',
  },
  transactions: [
    Buffer.from(
      'AgAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAyCpwPSA/X/uoh6xzGpBs1G1IAsqZA91uQqziwYQnNgatULJkFR5mI7tT23x6U84I4qiNTWZpz6kseAQxtW++7EjiefZcezx5JG51Ip1+RNiRUL9ddhdLtx0Gxc4ne/5G9sgTHNb55eQocSF09KvQi+fQBAZ+9lfg7LL69R1NU9gEJogfGGOUvYAGW0Ae6gOw9FVjQBKyGwbmtEawKOg5SKsvUCEVHap6DBx5F6IZlle494VRMpYbOjYa9OAmXaV5KuEzfWdbj5Axedw4KHAHm8BgBuHVf/KHLr2fZ2HbHWWQv4Gv1lWmZ329Ww6juyp0BlOTzSvoeKq6Lkpivv4CtKh3audZdwL5A1+eapJd75aBjvkBDl65gR1TejwZDHAXVaTiNrObo86POzKb865PWryLRFxgkYcCNZgYQbaiieF6Rw49s1sHcsDszBTiZcHPcHvxbLFr/gvM8zaLkIxsaRtUMzq0M9xpMaAFYo83nw2RfpA/NiFLX2obTUNz4I3p9DK7rgVjVvh77SJNls1TalUiP9muAQ5DuNUzIG9j/9Npt6fj8lLmucyseSZms/c4mUiAFl3FsqbqpsC0tLqRqgIXyakFuptORS2Gb8JLOs1goENVgL6Jfklyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwPRG+5QCHc2hesKXqZcS/jTjxaUam3406kN+8pAbCaZLGCLmm7rBs6+gsxbNiXYn1pbEb2wI0rSRVgWlL5YzxCA==',
      'base64',
    ),
    Buffer.from(
      'AgAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAtv5Z9/8X27W56PhPIyWQCSZPAAAgqgMJbXoo7UYYIyCKAER8CfAiZ6qks7Lvggy6hRfv20mUUMopAaTBZY1E2spwPDFj7oVGIaN0YZGFpfSEb8m2ji21EXCAi+Fq+jkufaUDYvtDdlvl5rxEDgieG2Ab5JSu+c+mAfB9+xqyh8EZweCPTZy2ZXqoamfvZwYXa+Qqf7QJQx3vMHSLnXuyArTL3keWjkNBFdkc41gdUg+wxVg+93iOjcudJ/9Qk7Wzg+L8794vCqEjT8kaB77itURZ4ncCG/qZAnfhGXLpc1z5UheRR3I5nAoYnO/uRFRHhFoLFE8n6wrwJKimoNJYFRjhnAXvc2fUkR68sHxt1CWg450qhvi7II2RkNJyoUg7LAbv5CNWr/oCalA7TuJRoKpN0OJ3Qp8jCcDjgvUXpOQfOSDXgSypn4K9KLlh4eUhXbTFNGRzi5STvD62NrYgSRbktUmaBEQy7A88D0Mp9jYpfkTjeDlXPr/m4iE8UXOHmwP74I+PJ3qYiYmPAbIgWlmTBB2DKU10SI1SjHrLbRfWmQxzYj6yK9s39C4xRP6S678G1xVft+MHlJeQu0htiYLbd/PvfgpN63Z/0S7rn4HBCz5QNbmxwUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwvply5iVueImWtkoBv/Atb90u3UDTOd8YDcGML/6DFs/JuSDoJ6QUe4fjddu/Ir30p1873pUeNPDzrBHOi7nqAA==',
      'base64',
    ),
    Buffer.from(
      'AgEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA5vwEbv92jz89JZ+KsSXCqNrgKfCT2kKrsVrOXedIlriJjDZx0qCQ2syB3BNdYl3YhLZ2Uuvuh+HMByOCydwv5FuWexHZkJfDIEvcNt0T+VSqT0DleUYf/cTdDZ5F3RxHU7JaR4HZ21IXbsZLqeheLmMH0TD2xjpoFX5W8zx5N/4Zj1EFLdu9khYzmRkotskhr6riYCTG/OMjniIeUTeXH9bnRNu1wpdZYHf0QF6qV1iBtq/4ud3wzfQ/Mfk9m00LYHL9Xg5+8wl8Op9j/xbKluVUS/N8wyBV13nnVJFfrhKFv+mCcRHiJXudq0zxco+pY2ZjhG6gs66AaYsC8KI9h4V5dz8WhgCoCbZjE3qNrr+J+JZbObM3xpkl+sQNWA5dAgAAAC2BiGEaNRlfwVkaFSmzBtJH6AXDa888ABZMxmcNPvKBNklfeD34MQD2p36lTDhvD8IGC142mQh3V4JEaObJVWKtgKqPgilcK9PxglcLX6wOCnBxJhEnBnytX8Rkmo9IAbGzY2IoT14LqckxEe/bTgVcsiu0C8rlLwWEmQSzp8TaPRUMrJIJkuZQNWuk53zAVJDmVSArPf67p0YVUMR8dBv/hYbrN0GS8l55T6y+RmIsyfKwKqk4BNHMVdRFk5ARxRSmoYs9RWD035k2ErHq1LUmseHey2PyiDsGDukY20A/mzHl87lm6RvidA50cK0qqo5v8PZhlN5GmtiNygdC29OD3DfB2KqtNqFMjrRBRXS3cA0FihMkwYKsjZq4nEgLorx68T7Fv+UzdVk9yRKCfptTPWZ9gt06njHUBAFbfoyVKIiDeekmvddSSlwICzosAssXuzlgOlOQ0ZL5rrfRTTwnlOefyQpRmnF0sEBu4+aWeu9mTrdbjKxJI4XlUjjpAdSqnJfNn9zcMK21POZqcV8/gCb+cLJp1r3Qus0ikLDV/M6WrrAsLspTpWBdb3b00f4GwV/gJNd2g/m2S0B043vDj5xBrH3EbiWnL7F1KRxejnD+GtOPMMWP/NMxptJyAkJUyqpAsBjuSsHQQGtefZgrmfuYN3ECRu9wbjA8QBATF1S77ejZL/2y0DO88LJ6UWto8X5oH1I+OSHtfnp1vW0tOj+NNeHR734AMQtHtFpTY4WQ7fLAIuIoYZmVVdlyRxTNRk9O+udlkR4zPFheu0y5BAVOW7GNR9F/aTITF8cUJtQKo4hTsLJS6ZHG/zTxw+xmOrtYq1XqiyJXihfftCaGnUBI3Cwnh/SZip4Yh5FcySEcfao56j0YqbFIq1vxCildBQ5R6L8C',
      'base64',
    ),
  ],
}

export const DEVNET: NetworkDefinition = {
  id: 4,
  bootstrapNodes: [],
  genesis: FISHNET_GENESIS,
  consensus: FISHNET_CONSENSUS,
}
