/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function isDefaultNetworkId(networkId: number): boolean {
  return networkId <= 100
}

const DEV_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:eqhg529Ydl0AyireTv9YoE4ZKqNovtzKlpPZHMjv5nA="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:TI74kONUM0uKxoyJw2arPml2wyHYvKnx07HT8WMt9xo="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1678914150360,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAp+O6TMU9qJk9/vsB89gUkKELDrMsZrclCYFSrjWk7bSltSKRGUmYY0j/9VtISDvgOh0pnbDlMkDd+y9xSNZJ7BGHWtVpuj7dUYxLw7tpjuWC66lamo6ErBwaRGYHXlOsRHnpe4DARMB/sbnJmQe4Q3tkOKFnSCdwRwU5921cj3sF2yIIfCy39Ir7AHEtpktKJJur7zGBqAi13GaXPw+vFVkun1xHAcEgrZTZ7l9yg1KgaGSKXERU9cMwACb5y6/M/aHFUSpR4Ve5GJF/5KrQoAg5M4Yd/xuAj3kgaQOF7nyxlRZDLQMCZpfJR8d4Evb8M8Wk33IpA/ZvfKICA0eH1e3Xeu4HDkLjWJcAoBi9TUtYtBBHZO3l7boVYWy++fQswLl9yBOQhIrAIg5Cx2O2335vZezroB2GE82KTgPWhGoK3yto6bVNR44IYkSs2s23pLI+pH1pkC7sS1hQuR/NrsaMjZqkjOvz3r0MK3k5UaHfOON1baiNprYU2kXSNqTQ6RdTxzAYAHGnTtrBkD6wG31hzhvIpGbDZvWq4voa0rUQNXSUl1LJOCpLq6V+U80w5VL/IlzYPO9J3UzuH18nEEdlxzvyRLOq+hqiE5CwLJUUfEniKw8quUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJbhu27yWIYrAYbOIYJJ5XzEhiBqKinaEIo/Cn54R76oKUXACpxl1mlr/dC3P6GkXJe+4dvko7gr8SJKSseDgCA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAUurykTT0KDf/dyFA9RxVTDOsx0BfuwCA11WwcQ62CUOQj6X0L+pnx618M4wj/8Fl6jt8hHDCX4JR1sVGmNChYn6M9HCYh40S926uDXe4/be2Q/ylkRYRU9pCv6Q+Ognt/l8/80cDjQqEyp+mX3oqP5xoViX2DdmatEyKjEN1rPgZdPQHZVERBVVG66jkT0d3xN844DoHP6TJfuak7G7/WP5+FAh/kEi8eAwwKB8mkSyu82bd0bBzAk89voySZ4L4RdmqKVm7q6j5DG2KTVPVCtpSQHHFqqiamsfSuOBplm23ZJbBmKgxFTTXXFVh4cBFgyhtfdzOMplpjx+AyoqvO39jgT2d+HyS9lEhTH97+r6VEITwW91ySbNy4AdFmAYE6CQJVRQSUX+5rE8bd9erMM+1U0n4ZKP18d2Fp9ziBNehfCM83wHTd2xkYjqhZuD5uRQdXJcPr9IHYtjsMt2YmphrcVHw1RnC1DtVijJ2p9dMjsP3x3h/7FeVz8MShsMe4jBQ25AUf+Ib5AJ3y1YXbQ8MfYp6DH1fpPqQjnFranu1KwYnk3tmgMGdZNuXK9i0Mm7dqel06JOtpDERNrOQeAs2KiTHruB0tNghVPdGrzDX+otwO5vBQ0lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwpvZWaBuJOYDJrNRUASOrU0GQyK+MIChWidb8GlzMhL/joVzTBYOLM5BUzaW/ViUdQ6rVUh9vlUpNWUJSWzviAA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAR2wM82ImgWBpyCX2QuNfdUPAGTlP0AhZsbKygQopXKiFvoUgVXDWmvZd27Yb6/Wb4Ru0ekij8BTHSM0Xa9au2W+yVN3chJLAroChwWnsnEKsAcBJR2t54kkdSDNSxMPGgQlT6a2vChIdA4y+SJxokZQCOmG49WgRSCh1RLwt5xYE/bczjNVj2K6C8q7smyNv6LiDBpHvHAjmlkm6AC+z27CSCMzeox4eMsGKGRE6E7a0pywb98BADUxVMruFSm+xTrgFEUIX5ZiMJEhc5L3oCO5KMei0kAJ3FD5tudqFhzkj377G0Wh23ei93rGhRILqzz1HitqQMftL+aSBpO8QO8xJPBD/y/gVaS4UaP49hrqL2O/lZLgMAOyYjumkvf4lAgAAAGXzSxtTr4jduyzMhNwFglDRLeqNnL6a9qePfChunDUQgHrlvOwoJ7WoZVQ/U3abpsNv75orzAeXVi/xKBIFN+JrJwaaDv7snvwd+QGBtuz3SK5DX/UYX24/S+eIY3hWAIrVBZ0Y4EyHUUCd/xVyWXuzFlu+ykUPidr48GGACLTeQKVcjpcwMKeGncOrdh2i05ZlcT/D82FxjBe/bofeUYWd+u9YzR0iQqRO0FKGSqKcY4J22V/qq4REfNwQyk9fQAYli/nRVcvc8naHDSSVOSILK3XpAMoiL2kmJdJhspgsQ2X1EmQV8Tn3wFw+CFaJlogNnOrEpjJ36uNHH2Lc1sYYMKo6DmJiy/P58uR4Uste7BXbpxfn2JfBiaFdYDNrzmZAcZVFecxfP40UpyqFB15XLSvTb5EytvSUWP1ylD8crKvbHvkam55chrXmUUyOu8ivulp40lU6220EIbRv02AVDyrZjaGXcKKwEoCD5I0A3a+HbzgerRU0sTYonngj4YdLAZqWzEarIsow4qdBPeGwslkXRqNkpOrxTWRMXCSLb+MJP6X29kPV0vSra66T1L1O8hFFoslCugJm6CMXbSwu3THnwvenOeHW5Bk9XV9ZWpRcBYvMdvuRkrwRIL2yY38y6DndjBRY24xAhspcZNLt65E0gd7SVBMUhyuG27SBxrGmkmRoe2PuLBjdlqxQlxpXTpgUbBVA26EjdhBFYEz/oN65FINXdSZYmzomcq9rvB8LQqOe9JXVftVQvYbBp9KodWyAsWTCrL3i5xLDqtu5z/DXy+sd77ILyW2iuIUkbcMw09oZ9kGEVRYhsLgFahvch6Wk5CjVdYY/sgKhcn7K0tFLxcbLERGSUvsOGMGI/opkqMOMIUp9PUksTBQwaQq4KJfvnWgL"
    }
  ]
}`

const TESTNET_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:eqhg529Ydl0AyireTv9YoE4ZKqNovtzKlpPZHMjv5nA="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:TI74kONUM0uKxoyJw2arPml2wyHYvKnx07HT8WMt9xo="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1678914150360,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAp+O6TMU9qJk9/vsB89gUkKELDrMsZrclCYFSrjWk7bSltSKRGUmYY0j/9VtISDvgOh0pnbDlMkDd+y9xSNZJ7BGHWtVpuj7dUYxLw7tpjuWC66lamo6ErBwaRGYHXlOsRHnpe4DARMB/sbnJmQe4Q3tkOKFnSCdwRwU5921cj3sF2yIIfCy39Ir7AHEtpktKJJur7zGBqAi13GaXPw+vFVkun1xHAcEgrZTZ7l9yg1KgaGSKXERU9cMwACb5y6/M/aHFUSpR4Ve5GJF/5KrQoAg5M4Yd/xuAj3kgaQOF7nyxlRZDLQMCZpfJR8d4Evb8M8Wk33IpA/ZvfKICA0eH1e3Xeu4HDkLjWJcAoBi9TUtYtBBHZO3l7boVYWy++fQswLl9yBOQhIrAIg5Cx2O2335vZezroB2GE82KTgPWhGoK3yto6bVNR44IYkSs2s23pLI+pH1pkC7sS1hQuR/NrsaMjZqkjOvz3r0MK3k5UaHfOON1baiNprYU2kXSNqTQ6RdTxzAYAHGnTtrBkD6wG31hzhvIpGbDZvWq4voa0rUQNXSUl1LJOCpLq6V+U80w5VL/IlzYPO9J3UzuH18nEEdlxzvyRLOq+hqiE5CwLJUUfEniKw8quUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJbhu27yWIYrAYbOIYJJ5XzEhiBqKinaEIo/Cn54R76oKUXACpxl1mlr/dC3P6GkXJe+4dvko7gr8SJKSseDgCA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAUurykTT0KDf/dyFA9RxVTDOsx0BfuwCA11WwcQ62CUOQj6X0L+pnx618M4wj/8Fl6jt8hHDCX4JR1sVGmNChYn6M9HCYh40S926uDXe4/be2Q/ylkRYRU9pCv6Q+Ognt/l8/80cDjQqEyp+mX3oqP5xoViX2DdmatEyKjEN1rPgZdPQHZVERBVVG66jkT0d3xN844DoHP6TJfuak7G7/WP5+FAh/kEi8eAwwKB8mkSyu82bd0bBzAk89voySZ4L4RdmqKVm7q6j5DG2KTVPVCtpSQHHFqqiamsfSuOBplm23ZJbBmKgxFTTXXFVh4cBFgyhtfdzOMplpjx+AyoqvO39jgT2d+HyS9lEhTH97+r6VEITwW91ySbNy4AdFmAYE6CQJVRQSUX+5rE8bd9erMM+1U0n4ZKP18d2Fp9ziBNehfCM83wHTd2xkYjqhZuD5uRQdXJcPr9IHYtjsMt2YmphrcVHw1RnC1DtVijJ2p9dMjsP3x3h/7FeVz8MShsMe4jBQ25AUf+Ib5AJ3y1YXbQ8MfYp6DH1fpPqQjnFranu1KwYnk3tmgMGdZNuXK9i0Mm7dqel06JOtpDERNrOQeAs2KiTHruB0tNghVPdGrzDX+otwO5vBQ0lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwpvZWaBuJOYDJrNRUASOrU0GQyK+MIChWidb8GlzMhL/joVzTBYOLM5BUzaW/ViUdQ6rVUh9vlUpNWUJSWzviAA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAR2wM82ImgWBpyCX2QuNfdUPAGTlP0AhZsbKygQopXKiFvoUgVXDWmvZd27Yb6/Wb4Ru0ekij8BTHSM0Xa9au2W+yVN3chJLAroChwWnsnEKsAcBJR2t54kkdSDNSxMPGgQlT6a2vChIdA4y+SJxokZQCOmG49WgRSCh1RLwt5xYE/bczjNVj2K6C8q7smyNv6LiDBpHvHAjmlkm6AC+z27CSCMzeox4eMsGKGRE6E7a0pywb98BADUxVMruFSm+xTrgFEUIX5ZiMJEhc5L3oCO5KMei0kAJ3FD5tudqFhzkj377G0Wh23ei93rGhRILqzz1HitqQMftL+aSBpO8QO8xJPBD/y/gVaS4UaP49hrqL2O/lZLgMAOyYjumkvf4lAgAAAGXzSxtTr4jduyzMhNwFglDRLeqNnL6a9qePfChunDUQgHrlvOwoJ7WoZVQ/U3abpsNv75orzAeXVi/xKBIFN+JrJwaaDv7snvwd+QGBtuz3SK5DX/UYX24/S+eIY3hWAIrVBZ0Y4EyHUUCd/xVyWXuzFlu+ykUPidr48GGACLTeQKVcjpcwMKeGncOrdh2i05ZlcT/D82FxjBe/bofeUYWd+u9YzR0iQqRO0FKGSqKcY4J22V/qq4REfNwQyk9fQAYli/nRVcvc8naHDSSVOSILK3XpAMoiL2kmJdJhspgsQ2X1EmQV8Tn3wFw+CFaJlogNnOrEpjJ36uNHH2Lc1sYYMKo6DmJiy/P58uR4Uste7BXbpxfn2JfBiaFdYDNrzmZAcZVFecxfP40UpyqFB15XLSvTb5EytvSUWP1ylD8crKvbHvkam55chrXmUUyOu8ivulp40lU6220EIbRv02AVDyrZjaGXcKKwEoCD5I0A3a+HbzgerRU0sTYonngj4YdLAZqWzEarIsow4qdBPeGwslkXRqNkpOrxTWRMXCSLb+MJP6X29kPV0vSra66T1L1O8hFFoslCugJm6CMXbSwu3THnwvenOeHW5Bk9XV9ZWpRcBYvMdvuRkrwRIL2yY38y6DndjBRY24xAhspcZNLt65E0gd7SVBMUhyuG27SBxrGmkmRoe2PuLBjdlqxQlxpXTpgUbBVA26EjdhBFYEz/oN65FINXdSZYmzomcq9rvB8LQqOe9JXVftVQvYbBp9KodWyAsWTCrL3i5xLDqtu5z/DXy+sd77ILyW2iuIUkbcMw09oZ9kGEVRYhsLgFahvch6Wk5CjVdYY/sgKhcn7K0tFLxcbLERGSUvsOGMGI/opkqMOMIUp9PUksTBQwaQq4KJfvnWgL"
    }
  ]
}`

export const TESTNET = `{
  "id": 0,
  "bootstrapNodes": ["1.test.bn.ironfish.network", "2.test.bn.ironfish.network"],
  "genesis": ${TESTNET_GENESIS},
  "consensus": {
      "allowedBlockFutureSeconds": 15,
      "genesisSupplyInIron": 42000000,
      "targetBlockTimeInSeconds": 60,
      "targetBucketTimeInSeconds": 10,
      "maxBlockSizeBytes": 524288,
      "minFee": 1
  }
}`

export const MAINNET = `
 {
    "id": 1,
    "bootstrapNodes": [],
    "genesis": {},
    "consensus": {
        "allowedBlockFutureSeconds": 15,
        "genesisSupplyInIron": 42000000,
        "targetBlockTimeInSeconds": 60,
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 524288,
        "minFee": 1
    }
}`

export const DEV = `
{
    "id": 2,
    "bootstrapNodes": [],
    "genesis": ${DEV_GENESIS},
    "consensus": {
        "allowedBlockFutureSeconds": 15,
        "genesisSupplyInIron": 42000000,
        "targetBlockTimeInSeconds": 60,
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 524288,
        "minFee": 0
    }
}`
