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
      "data": "base64:9pKVlY0055jIzMpe0o2amm8ep2Xny6E7aeNwiqNz2xA="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:T9f1+5nsN/jWEWOXHRPAPgNmT6svoHQzOpOvTjpRyNc="
    },
    "target": "3675939340867180807097491587577393900103809037004462350458970",
    "randomness": "0",
    "timestamp": 1674062141529,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAnSV/JUur26hwqUp8fEQkKgbfBrq0QwqaRBSqfPD7tW6yGvh0TnporLaE56011dgxv3cMLqgKmK7BeHm2cRnxj9rpoT2rTXGrD2uoO5942ki5SijYX7t+Zonj5vCwPEqnSj9hxUdY9iL0WjyA9+VaWMW9gnkhXWrRjDlZ4p2H+94Z7Vl0kSId0ZoUAyeLo3iicbK4cwdUfN39MNgLMtVr5o5RbqpHNOH2232N6GHgw5CpY2psfm09A9LwneDomCdbRyxvBiYtNQiv/1Yq/scUAcbKDuhAV5iP/3Z7ARPrWBoQdqEASFGU19ADHPm7XIuAIum7FtQsPIlQRi4jFn8XYLR+H2CbmqS6/5P+BNB/kxHGARmNa3rfRktpKy0isrxsEnHDRKVeg6SVHBYYmbhEaTNfx0qbVGI6Vjouj3fVE9e2eXzwC9Jqm+jrnc1lc/CBH03g2hfNSSfQ5Z71EitRYyhyI5WJo72bUQAMB8q5djo6lutABw0zWQHLig6PhCZL6GIpNpPHg/zx7h/9KPzrCWAbk1ZYeyq5rU+rXIX8A3wS8W8NEPTeFlUBsUS/eGfe+9sOsIVKjJ4G6qbK0zkAng4dq/4oanFqiwYc1dcoVIE1U/rxioA0TElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwS0kO2IxVpEDEe0Qj53iFaOWgaqzYEuDc15QmXRq8mALuyROFuHDFcWKRsTqM//yWyq2u2bZRU7uOjrTuSJVPDA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAypc6B2qxTgivZYxXA1OS36TpGEczBGAAYtY+XxqmYcqTyVGNEv3dde2WOcQNeR2csLkMR4gNl7ZZA/Uc3kTaTm71GRBnUblhwo0bsW6tDUezU466Wa5TRRkQN/zAQhoWHP4aeo2/lqclJ1coPdmtUVXZIvb78p1MPwt+c+QFi7MUTRaf1rXEWSgLAjVfkuhD+kmtPTKBANdFCeI93R5KXioQ0KM8MznvdhJV/9bpBB2nb6if3HSGXAhBJDe85zmq5dIa6Tz2cH6Rjkh61nQnObLJZ1eSt+NUMnTiCOYbIKqVjsJDjZntiZaB6P/GHD74kNjMfiw6IycRyO6s+9eYyZqmxv5SS65tS4yVmqZPJRY61RN12vgdhKioCD92FeoPz1yTzbCHHLCJEGLGfssLdUJjKifivQQ4ppt5CBJK4zZc7b9/mqaH3L0p3eOwhZL7ARzJJ8uSxz+ZZuUO5lAyRLhnZl0zsYeZGgLVp3t+y4Mdc1898r6YdwJ94w/QgJKNIR5cJ90cqxCsZxvva6DdggNSfCBpm4zY/InyzovVwbme4GfgbgqgKo7/FtSQGYpt7ZdkKV0o3OoY8+MirFB+5yud7LPITdX+vLSRMSaBPKWbs6c3TpXjwklyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBzcWBASkl9HB51lc0y03z+Cqb+yN7p0mWvYgSD1r8FMvvYP9w2moj4Zp49YwCscPvzmNtvmHu3E8MZhJdGl0BA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6eI7tGEEBnizj8ov1zgGs0Yf763hqnPZde0BDYxmAomR7uLLEumrzX17MlNUN3yZGLGWPqbtO5k3ZEMqpKyp0FZyTio7mPwHuhw9ce0g99unH8ouovrt8e8T6NItWlpXd2MEGHyR+Af7mVki8NFc4i76FuqaRA0AQy4USnCFW6cQbDpydQh/NdgSthCbk6y6Hcls6HDqPfriGBgLKaqujQQuR8DQ7486z4sHsuXkxHuPydyhdxh72buF2mPKHQSUbVhLbXkZ+n6KdYdDmP74BM7QUAB0WG30pgmh2IrTRLbL9tNiWux8bagkyeD1fvrwbSTPW9p3pVMGLKVhP8gS7bLDYVIWcXel5CNzbQpzOh2hywoZUGZV/LVbuxGCWkImAgAAAO4dCFkvZKBRhu+FjnLA5GVf+k1zadKNaN7P2zX0WvVBQt4lDkHqO2lbUxbGpOi+IVTGa/7SMyTZb9JcTmihCOmXlGQkupGrrz94cOpN28DXocc0irgvlvtn21n/DTkmDq1Hrz1zNrXLXFOHJ7nco36mRegoikfVDlzLOovyqg4v8qpSA4xmiCWgttfUTBH8uICaeujPekOByQNMM3JGGk3BkEIUAj3+Zn0UWx2duNYpmzGI6G4s1PBl5hkEeVXnEAvvoI8e13xH5V+FQOYzeDQul6GaS1Ltzts4aanzXEWxn7F7QRFg5VXMfEe3kPrxsrcky4gaQh8TtOQzCxn+P7kQcpIDm0+smsWWrHZGlXihZtVl7ZAnBPHpKtzN55sOL48l/BVUwWN8ke3FegMDir41G9qpUA6Cb+BbazPytTBBXxXi0f4FjC2JuZtu0WksMPiFU/G86gvYJ2n51YWlrBZ8x70FLnPV07ncZQAKXOhR9AHDAlOE3h6WIG/HrdRSlP8KaZqESj/OtMXgwwYNgQhW3H39Pt7mUeq8U4ONIaCA+1ZPFfUumA8zlDXvsb1wcoN6aTf71oG+kbHcmvuKSqjoiP8YiOpHqhVXOe10ucI55x2hJusGwOSno+v3OzIUxb/+Gtvtdr91m8L10eOSBdv9EXuLmRZ+SUfehZZBkit1dVHiADO3qr8dbQgOsT4PyK+NwkAMHaARz9SAVh63hr9eXZRjV3hPi4RqL2KIFmB8ZQsYaOqM6egfrHKqeZk6dwLoPvkPiseSk7UlReFrJvZlkeOSL23rPq0dOO96ujvI7AjxU42CPxIBsad9nSKSL/fSugZ5suyHWi2ZAHn87g9LIWNVnqRnkEZ6Iq1+xMblSxagTQAIQPBm50FyGz21ITenI8QpmMYK"
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
