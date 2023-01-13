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
      "data": "base64:qHY8Gdp8PpwCfSUEUBzdGKIpXm4zGu1tbJlrELoV+zs="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:AUxVAC94fE9tSX+f40e6DgXslwE8vvGxtDDvm2pA9KY="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1671148216284,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoltaeNxUtx9GlGlQkjpuuV8gvzaltmLZASqLf3JWqReqaVu+gTkekj0C5knIqvyoKzw9yc4pGmTL5WTU5j3H7hs+e/c6o5wtbho2epqeigSLSgqr5u8YUpfpE1NX0CZcNaGwfUOK2M5NhpAirMtsqc/ub6pd9hXT/6475+ufZT0LU2Ot+DL0dMShvcjAU5pDaqU4muAC6VtxWiGEm/2wFnCwGiNvaQpB6BMP0u1lkg2QgmFPfac2I8k1KXOuhO1QQGS9pWo0tmuXOotboZyk1sbZLjoNqETH/b435Pvp4ALUyRpA/LWpq4N04r5MP3tDnHnvlisPRAPCisUOr2uKyS3V/Gj1MPf5YQpjg06XU/iBHdWxrpSbgDQjyPISBY0WrX5PrNb3QcXvFaZpjXSAlRB7I5Msdt1+OYpg56D90NlnSBLvmXTKIiFSEhecBHfGCIKXS4z7qFBi7g5iJ/xY/dgJ0g63oZ+trspp/d83hLKos4QMhv/8JVCnpMDT3SYWlCZTAXKAoyvABxdaanoOMxwR0Q0aT+UGxVN8krJLy6IdqeLieuD/gL3nTlo7Jx9LGCimiiXOIOeSe+7iYLks9OHbHs5+P+8vlDv0bX7HzFEa8RrVonBa+0lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw8Ig+/174AGmamlKjpCDf9NmPOC1AtfeRvLQ7BZ9211XBZotJOIk6ziqxmQ9ctkX5bcSV8COH6UfjkOy52gimAQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAjwf7UYDtg6jYTZnwDNlipH/F7SK/YXY+2l1H7bVn4K+mmnYgIlhNtQOTGFK4aHX6aWb8GBR1VG90QMsGqBJMrUwzzlxy5S++WCwW4R2kdPiiij3R4HuTNG1HQNo2d/7UXSxWKz0QgjwynA96r2FYeSUx0mriPAy6IDXvNVmTQFEJpju8s8jXFa4ZrvRJV1XXFTAQ+DvGQBImAZMRpoXMYMj/tPeQB7Ft5sln6XbbsDCy/Dw/HKm4DJWXj8K4S/21cNr1QZ444tcpLUkhJbWMCZGxKkl0ozaRzsfpA2T7x5FoKI6tbozdA6j5K+p+msLp2sTPYzV0qSMZndfXZ6NEkfn4PZHeCZTk2gq+UBkG0I38Cux8gEee9fVpI8IEzQwEp5S/kLdJICYNy0fQhHfjLhRP3Vk2r3zc4NR56hwIZKPDW920bpikCeBqkjo7dYFW9czh+Fa4Yo2i4mFB8xOb8CBYWFPV5VbR7DNH7czEYBvAyNAELSODCcO5HuTP6rwpU3VQjKCyYERlZ/y2a9pH65Z9v7kPCbhcNU4l60ZaO9iII/KJP723DfdMdNxp5bAVq4867+xt6/gz28R0Za2pO6TWi6iMttcMU9KXu3HbI/JlFEvXXJrDpUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwkMsEJKlZcTRNUqcwUw1YDKXetCNHe46cYVAqFJtb+5PuCCmFkflEE/OgsyumsRsjXK3V2C+Pdq0/SC+NHbh2Cg=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfkWqb6VOJEIGKPEw//gekxSrMI01z4GoImr1XuxlMJ6D5j8vI0UtVdZ+SxNjkbVCUnfRW0c8YSjw3lnQAF8eDh2eIeWH0L77uMR5ltLz5BuSogbmlGJy2PHVEpZV9mgiA4Nrtf8dfAEs9H10iWjujaIoy/ArG3dQ6N8ngPOqxu4AWUzctxg21d+hlYMHlmyNRbEzkM3T6orcrxYCdfDUmyviikdvftMDrw4zLoFnN9yssmoenCteOycqBvsfy6OqOszvepZXILwHw/IWOVzHKql8QD7tSg2EcbkpSSxNMzWu8YoXyDaeATlliSF5EbvEv2Fgs1uolR5YrQ54piw+4X9u/bUwVQbc6kIe7BPXU2qN/Q6HHO8l9p5K5bq/I19LAgAAAHriCFfR/0pf3ah5kxiA8Ubh9t42UL4LT4kAPlbvysO3NUITKhOS2IQvvftLBwu4w1Vhl4j0ETE4d8OfwssajtW6jHpozk0wo2aDI0kBsb/IIE5bn1J6Mkc7p5sJweYfB6eKyfhvT1TVGrtICx0bAtuXEIv+Njvr+k2rQjIWUGlyU57roidwG28uBUH4AxCssKeK7OQ7TRMZD2G35XC8LG8y9bhWGzErtq9DYqBU/hJqfaF79ExUNboQYaS+K29iAA0B3rWfWZhSFw2ubydulX4wea/44E1n9rFPTh42eIlSdoHNi+7LBM9A+WRxl4kxWpUp4T0xi89l/t92HGdE/mYA7NdFwHuOZYbAADZRhT5hyMbKO8+lQWTdZMKXoFSfM0He13+42WO2ld15zcbpWV+zePWvk50j0G8Mf6NkYSPNM6Quu2lIevzO6YFvFBB985oTeIoIVRRvkqjwIBsI2GUneTyAMztoxeSq6l9FiPEyUvBWiXxLMsCBqnKUietvWpw+qzqGDGjerINkFrIePrZm8Bq8Y1Kga1kPlH2920/MK6sGfs7X/AQajYkbOVzyqPbqCy+Gl6QiifPksucJpu95Zl8b8Ayl7MmeFaKZNeer0Mc0MDDhZ92nvlJUFIH4gb8Yadc7aLh/WI4Z+EeEP6l6CMpQrsjruGDLgyiIMlFnBJ9MPJfvGfs5ovrQnyD1Y4uNqAcvnxRB18WJ0ZinsnZ3RbSoQCu/cnl2cOd3I/YZALsPILh8MWuAqVt9JqU9gXNw3mW49o513PncR9I38aSkAitCZjfPlUMNeHK7wOOv39AxzeCzuNcCOqPdFErrVFErPpK8JEbESnAKDPI3AhC0UbgmO8VHY02Q6fNGRqp4SihJTh0N9sbSO9T5YyEsN7S/JgjnT/oK"
    }
  ]
}`
const PHASE3_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:ltz3SOrKQcrlNRetrRdy+7Bqsr4BvphuBZSt5cdaOis="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:CS3YunnubnkJwyN6cbrQa5sGJMIiLsWYEnzLio3ntgY="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1673651621872,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbsQEI62kubZmITuEqT9cs6ebMG3juy3++Ff3V9Ap7TOKP8oqPoidiB1Yt10U0kdN6HZyFV9UR9byQlyFEjq7xwE980+dkUEz0xbHcUS+8QWuRD8PT//3PjYUKvHhdLGwVNCm9/2eIx3EayBZOmvVqHj6M3uVLlrF6lyKtDhKsoQF9io0gO0BfOETiSn+H6F/cUZN7mvHxrX7H+fK1SUuS0cgkG3Z+C1sWq5QwtckX6a1tQsh0ioU0rcQcBtzDk4o1PjIkQOqX+DG1w1Ww0aisy4s46rtQDp8XZx+DA1n2LywWOBEVhE9ZOvIUCfmLgbWn82r37h6uimJmV7pSi4KOHn+rSEAwHWE/tbEIOt1RAIjrR1Bq3qjRcXD3RGVmrpw/AvTxksA+5NcN0BUPTZU12k2BTrI11Qtc/J3PbmFONAmlo795nlEKIOmFzJkQA5Ddr3b4lPeRzIaMXrWiyWfNGjDObpOOdkiL3hIPAV7KbapTFH8ec+u5efkEM589dMf1s1zG+SzilvIY6HDA4PViFL7ffq5Bct42HgyDHops1Kvw9o4AbAZ3LUeM6M6+tbt4IXoFvSKQe+zf0Wzte3mQOmBwL8n2/ZAumNZ5VCQM9YKxjkyd9grMUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwR4qT98zny0oN8DVJzDqkJiT/d6bdgk2e8cP4C0DCzKrdLeP1+EZORnuBzL45SiIKihHaWtTXYWwDs5zVVc2hBQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAA3esAMJr7465zypR2OFSwK9VRxAVQ/ZPz0b7RQK6IDPGtCiCx+UO29ntqdu/KVtRZQ3G2nDBGN+LspzJC7DSuGuM4HQLOFWQ8fkgbhPti4NSSmbi7cZrA7e1haCCJ2MTMPkKCGcccNLRZhnKKWMQ3H0A9wHIgdAGtBKUdry0YMZEXDAWmbkOV657tINXJtqCpqgVxRSm5y/YBMJV9N430C2kmsyTaKGU4bJCb/7PM8ySHrb/9e+Jp0DuDMW+MgLfVf8V3f8Y1/yu9P7zjk60W25FfbR+bjKXSMFhaHVUgF3XQkul6bgtG9xPbTCYn6ZIOYGtrQz1KQtTBegsPkidsHCgpBP1miQNmW0pXdDlJKtq3syXSqL9qgcVEJwNV8DkeqU16EdbMfOCXjSRUFTaZ/tWUKhjMdD51/BDZM13HMuYQdz9nItznXmlEd559g3X40F/dvORMdIF41KB1SmaJA5f3eIr3bDzZY6lIZ8X9ZYxl+Z2L3mFFSSk/nkcJSExW+qs4wI9spjXjLW4ebR7hQ6dPiw3QyH6J/7q2RX1eeaNZt/keDfPeaJsmUCMoUqbQG4ch7tskyjzsNJG10r9n6qh3E3SujtyQ9P3M07KkSnHTDwxPVdb4+klyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwLqikrZKHb3Km/k8g7kZ7Y/7ySIrlatoUnD3oy5mE/ghaQCfd7iNdTacpbV2zyZRxjVRGdA1CMilZ93H6xJulDQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAS5e7AwSrmBZbv88/uELttwaoZpk9jVPBdrSicGIkzmiQyl7aBS21biViNh1dvYGsKRo8k/hYUWwcJLz/Oj56g1vHdTnvLik+iFjM+jl/t7ynpiYFrhPRqSQXevpLQhbHtas0Y7McwFd7MoEOUF0Agj5UeSucXNGMo0KY3tNvHg0A0/qyx/+QPTX4shNo10VTowZSI0PTjBAtLTjyy9RJrAVr7xnIjwQNAqEvQe4oAp+WLfxZAodtbj//WdWuJ9JZFIkkpaXuS4qGWIOEaSJGQWzcnVXnfymjSdSEsmAh8jDPXYPzWqLgADahCv0EZWrRBg+oA47mr/mR677EjuCgkl+Fl/xAzljE6Y1wFimeyPiMNSxILN9/GG+5GxTCnz9qAgAAAO4vBW0xLiaoaapEV4/MHeg6151+54GSG7cJyuDm1iz81hMA5183PFWP6A4A17x5wDehWgU0HrRwW34+XvtMHZ6+AIasJE1vaqNBGkfTQT37fb7BWHcECmWCeOMaUXPTB7fLCyhqHcgtnkvcShSod7DonCvTpLSlT53BtTGoQKEeFZc61EYAgftZvFm5Yzl/VaGYxkff1NZWbcDqS/SqlHii7gQhju505jSQvR6iX/l8pBSN2xa1hfPbiT8o2GK1IxK4/y4KjS2mkoIMn/4lUzErOKNz7Y+5NRiJf7FnvyR/nQ8V5rJEKLG5YVX01jLqzpiPCkEKIptKHGzCkIfMaAr8rwzqHE/OIuggS8FEYKwqYeST5O4jDJBE1bFPM9PfJBUrO59Ztz2sMRnuCDqLCIPeN6mzSmtcrXn98OHSrkY/RfMZ/oHs1R+quyMJUFY5mLMqCnZ4a6YTXR56iJks/yxuEH+/dYHmPptIv8n1AFNK3dmgbymkjLICxsSh7ZwApkAEr8/7AZDjMJul763bGsT3HDVcqrpuvBWNay4ZQaL0b7mbPfzVe09z5qeESmzDbvV7Ya2ip4d9/r7qWSO+a7tKfeE4ppRs5vO2Te3eVMJVaPqTWvdydftkxsX0ScI5uAw3ON5Ex8vMaWYTjk556XqPM+KA5XzeZGwju3DPLKPOJF4tB7pR6qxic4o9rehmELf7GBFguhoEqIBfsI0p9O1/O/djaLEwsIkNhmOXPI+gZtB+oYhBMyzlQ34EVPtBwCy+z7EejQ8kn7RrC7VNvqlkD6y5DLaTXd5tg1/ckJcA4j124jJyaSat/85cj10Sh6P2edgjzx3ppoW0fSCrydQdoh43BQIY8SwVBxuW8XHXXuFhT/6PEkAiCS36io1fjjSYKp9/3xsI"
    }
  ]
}`

export const TESTNET = `{
  "id": 0,
  "bootstrapNodes": ["test.bn1.ironfish.network"],
  "genesis": ${PHASE3_GENESIS},
  "consensus": {
      "allowedBlockFutureSeconds": 15,
      "genesisSupplyInIron": 42000000,
      "targetBlockTimeInSeconds": 60,
      "targetBucketTimeInSeconds": 10,
      "maxBlockSizeBytes": 2000000
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
        "maxBlockSizeBytes": 2000000
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
        "maxBlockSizeBytes": 2000000
    }
}`
