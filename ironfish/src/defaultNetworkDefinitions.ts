/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function isDefaultNetworkId(networkId: number): boolean {
  return networkId <= 100
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

const DEV_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:5p5u9078VaK/SwZxf0PK5GL03yEGIuY9rY+3rTD5NxE="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:J42IwDCgpNSWDJcr5edUlUIzchlAN8HIt7PGx1Uy+EQ="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1681339461513,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQW7gJjQzYQCa3al+kgmH1KTeynWVlOayM3JUtxu7rsWSd28lOcqIrQQzDgn2b9OoLuzl/g3Qty03F6y2p+mEuAQANXdoHFyYyUL05fI6U9atNL07ZEm3VvCEErKpw65aM2RzNKzVV5qBnZyHfMUWsQ1gPgehQfqn3VfWcxZkzLANSDGD73MApt9r+3n8YVf6SwWaLdVP+AtOr4macd16HTf1Co7WE7ikuqXERiBV1TO0vgY4mgrQ7aDkQgPFH50Q9FFKzzFpAk9/8lYTrTEqoVg5DGbUUMkgaMQigvsPC3yofPKx6koutv2rHhWmcBoSnTE6I3Rgk4oG9tZAb0FQr5HglyMwDnceXf1QPs3BabZKi6QOkHDd80WxAdEu1mNxXqw9IzUdIisDy+hz4R7c2h/BS4+2AXr7iNvG/ldJRLP+S0JFS9AA+RjLiCaXn8yGLdd8jitVVk0mpBoAcPdM2zkTK88g22GwRGw/ToUMFaGSFQZzGVoSX9KhQ6s6o5hr1NlMJ/mi1eU9qaB9dW3xdZNb7S2dJ5va7Qg6eELSMTnDgrt5xzU+Iry9RzlK9OvG/hgR3LgdyGonRhfeYEDjy5SAtY+Vs63HErRxaU2nal1wh2CmNYxB00lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwfiKudpqWQQN1ak3i9Ka7idxy9LCulG+28RvJYgLZLpCI9pJJCuOuvL2QGolxOj/Gtq4oO+gRRs2a5JscPosLCA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAhFOC1mptRfRELktTeyCEaaP0BkGhP161IG3FI8ywMhykaUPTW10Ss2jb8Qx0rq35kAsqkYZ5K7cc72/wJKHKR/x0se6Jzpp6RlcZKb3XxMWpQBmmZHRkHe0OM5h2hPGgqE0ZYayknyVGzpB0Rdj/jw2UL3b/Ffk5Zdn9o7aRVa4TlJnJMhOepi3m0a/OKhT3radcOZupegcyYn08QMN4LpwCBIEMsJTqGZkwS0ij0Ku2+oDxjYTegdrfW6FlYZo8bmz/XoAEtkKf0y/A9rq4Nd14ngOv8Oq/KROaYd4X7J8N2zZLJrLmVDZIv+5l1bbMrOKg6QRuALyUll6LON4PuVovFwmQThSB9W2g7ZOQUaRZQxhL38Jd6UtQE/Qp4VRCblLiNrXRZSwbAbtDBNBvQQ22XZXoaaeuE0tQFlP6Hs0DtNjgPAJYguhCQra9S/DF4YUqPuGnUU/FpzAbGafcisEqbYFWz1Lh5iebLh6vwxrKAezDObneWX+GrqvFQZ5oOzFlahaT6M7HMronPZQAIroDy1YQhpewEMCxpjKKx8/UzQWvEoAdoqI4fh0Ub72QfjD4R0Qug3apBuJR1at2rQ7NyfHjGzEufqLC4Ao8wzpEKn7inled10lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwGVl7k+wkrof1kCF/C5ahwrax4ypdCTcQhnx4vDMIg2Vcyj/AnRjpbl7rNmY4Bj2RVXy5bdnxkXOyblVb4a3JBg=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARsrfU0RzXO/eeSJSAd6HLPumQUEzyTxzrVRXNAGPtlCRw3wTbL/B5OZ6jAO7S1Ey798uVdDU73YcXvF09QH7h7gQNVKfg/WCxduhcrsv6eSZ9fz7bIz+ObjHJUyHjiOMt/N1JRSBL3CKdvNrbmjOJiLsnF5L+GEpYfVRogizOzkMTveMcmNassZl5y1fc46D40j0Yf0EMLcltMW9kKxFnlDsUYQ9J3ojWXIfE/p4/Du1AeRRcrr114R47suYQ7kD+y7VxGXifsBr4gBXFmHB1AH8jyQi39G5P9EE9yahIbjnqZNcV+BOJPTkkAC0k8rnzJpJ4m5G7l0hOoe/2UkqB649jzmjKLgpUpWJWhb4uuY78SKJr5h7GdNdGKWEMJFMAgAAAPssoI0JKTqWW04i7gnK7w0moNoySs8YeBFOv5Tl27md+/1XaagdIS5akh93IvZwpiaDYcjNK59lydGktYs05s+uoMxWWIIf9S7u73HFfWKBntiOhjFvjeEiaeKrnN8tC7SuUD8c/jVXuEIIrw+rdnXp5tTVzGPCogFYtBOQ2w1QG9JpglAern7NHdCvDuEijLjz2K8QWgymShn7VbXFpuTYRwuwsboVJkAjj6DwgqbGcroI1G0rGY/u+2toTWnvZhY6WCsepEW+sjWt8rb7ENaQ5QiVQHzXHWqg2amxSNrB4JMXO3d9ifW8Pt4CWSfBmYwAk+7wiqTYlurzIe3tUVF/BQBavIoIEICPOGUEwmv3/V108NtBQw5BkWdZTZm7VpYDhSkDmGSWYzLzl1o+e5hSBkYGMD3m8L0v14KA51pqaT5708H9FWx68nVINHAYDBzry5L8C8c4BYFcjXFKeXFUDeZSduwLJCa6oZwRwNNQUQcO8Sh0IVD/i1fWwMcYsVOahlGgQMBtP/K53D1n4hlIvSvWvn02gRlkhtWfErdlEVeOsfilNj6Nm624eQpaIX+xHS2WCj7+zHsnMuyzCG0BQMt6O4JgNcoNFwUwEVArlNWIx52edQ5antuPPaxz+62owK3KRgNvrIA25A+bQ6+Gy1sW+6XccrX5y24xQXewSl2zmh5D/JcJLdQc0V+NRhREIoamLJBorO+PVZeUZH973JxhowZW8c0Vago5uY0UnrQinGKa/Ejj189paZ/knFDgAErLn6EVWkJP3Zthxo0t7qJ04GQLPkxvFKwThkj8gkU6cXx5cm/9phFb8vN47NeGOyqM42FErkFTUFVQkESp07n2e72eBuhccYH7mrqv2rbV9IrTaUR8NKAHK2AvDcVSJcSkrVsE"
    }
  ]
}`

const TESTNET_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:U5b5b7OGqM+0ehLhNYnwTYQB7QAdZRjD8zlPCnDStzQ="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:tqHnzQKTwv0RgzwnjHC1xedWkn8wD+hprguXg/r4N04="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1681339537127,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAk2EuR/JJ6NRgfK7YaF5uT/xKDLEMTdykFmoFjhpDM4WH99W4wVeKVmJgA0TXz31QgV5KDNW3TuS8ySKkCn8zJnn17E+NxVJ1n4w3Ir/y56yOF78pjRSIPHJb8byhDevCwFVkR4bKFLeQGebCSv5aFDelItoFJKOSJc7PX3EKCRMDukrXJZZPr+9o+lixsrOhbxOR6kwbkxNgBaxhBwxT1GgPFiVeTbMUn9D5GESSbi6UK5yGCYGt3jfWrGM6n/0N15B4CYqFwFIjXNlJlTaRzNdv0GFo41z2h0KaWs0EjXN9JWDKMcPux31PWAj5Xb6iKHlmvVLv/omefoLzqWBKUtldDz5UK5dWLpwR0+1m3N0esD71oWXxS5P1RbmMWgoIGav6EJba4O/qpkQaz/oLTihpfZKdI6+CAaDJMUhpSavYljS+rDH+KxsoLMUczpFCmlkzw3G7AKVGkDwkmabSzk6Q3xbZrYDvphX+64VEGTIDB5Cu//QEkHo+IBp1juTIxnCT+0z6fVGm42Ro36NPFJfKzB6s1nNOPSBkY37aGmaofdykzxtizwUXTfVYkCkdqrNZ9I1H9v1uAxL0hubNW/6m7FhzWlYKPrpj4xM78NPx6Tp2T2m84Elyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwhYg4sQPcSqeL5J6q0nWeerrgjUUxcNFo5AwQS2xbbPHKbjuNbWZamWO4d+Lmx9RKbEr4nJrpeV5uE0Dynql+Bw=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAZs5OgNDkgdPINHldUBmBCwQPYYDyiqZWEW2hc0T7OBGLwMnIgZfTMA+uoPWvO59qTW6qhPEgHRbWE5a+pEis9uVw5RIJ3D5CwFU5kiGsdzOOsIYx3JbkEnFvoPIiQyMzL1sJ8hK6nT3TdbI+M1vL6v1aGV6S/Eww61+H4QNGe7QTRVeqglWk/xrB8J0T/ws+w59W4eOOsiNUfp4epGwXaiWELz/VGs5D0infIUlS/KeAs1lTIfcFxJ4p6MC1yX0Glca6vgT+Dk0A6CKveboqu7EiywagmkyK7zootA9PPfjO8c1QNrnExJqHr82AbMmAI6Y8LfCme8Fzra2Y4JvNLkU2X1GR6iBbKAbadiZV0+z3TtZmpnJX3WXASo5i4AFXoE1/b8tdZwrkyDIj0VugQxmT3kco3NKokEUztNbpg8vk9CAqnDgTE86/9/u/Z6779vj5lWtrLbXK+cAp0mJktEweAIpei1bBSXfGa4il+waJ3ODVudYhK6AIVC7dLxcxjp4LqXvMF+Au4/WzgdnoRv+0f5Y1qdlf9gH1al0ut3vBoge84iwty+UaBu3E0BBz2H1Alnm6IwdS6bJETURLsjAyF0kW41gFlygkE5jUw4qINbMmKOTNJklyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwR+IJLuFq+Yl/PCvFq3MRH5FjM9J1/Zfp5ZzEJnRKeTvL6ga4FswIYtQQHp5L7XxzLyLwvrk0A/7FMyokaJv2BQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGGr4fUZl1pgE39zxdECo6aZn8DUMhhGxZh323sERm9KSM8jIkmZhQeiPyMESrhUcn+ZhLjB69EavAPUhGir30E2FiF382R4LMFJ3oDphCsSACV4aQKfMHf2eNmddpOhY1cKjnUXU/X9sBM24h0K9JLSLgfyVq7aNkxcwaGY/zZQY8XmTMcSEMTON4q0s1G8g8Qu/6NLOH3ZFSPx6dfjaE2f3fAOMzzSQWi8zXJER2xWtDcjytLZFgkqO+TdAuhwmEEPnqmWHM/8fB9ceo+LpGgAhYBcVKfdPXF9sR8KLSsR8yXbDwqeq/YVJS3DuViFiXQJWUHYWEhn8GdA3HSsGHYxpAGYxlQwwSFzvO4JfdLt+fcCYEI6cEWk1XHpyGGlEAgAAAOaOCPut8unV1Y9S5FH0A8uN58zx9Mm1Vem8AnX0k5QfFh67jViFW55+tvQUALdJy2jUPWXvS0jrwP0xPYwmwQS0VxBft9+Ko/GgQDUalPq2P7VjelLMxeCwnGGkxSMzC7Td0raWAwx2Q6XbHDZAxMhl0nu42q8Use5N7Ccp2c8GYTree4/E3WaYuwAWmkzYy6UL1AUxr4yBgZQB9fQ2npxe3QxouW5fpMbh7W6BrF10+hC5xf/mupDc0hh3qN7FnwogtkLRr0hr5OAvIzz4qJWqQvpjf3XqRqqztnqt5fvz1iidACesAaPp8kM3Dll+a7FSEZ9v7lX2V+ABdyTQPe32ACRrfW9NWhZxIExpAl166lEti9qY6BHE4WRR+N1qC4/SauFhWSjb8e5NbCy2z7EjoWfPmBN/eQJfZKedf5lg4a/E2gvDFk2T9ZbpAsY7b31D+Ei8d44+cfF8/uZWamml9WrFAAFEH4P/7Wsvpy6JyYprFEcgCSFbl1DbBj3KkUXh/a9qCpZfKhqViaocb5Zuc5jVfQS7/3ccl7ilW150nIqyhD04ZnzLacb8YpwISGV21AoC6SF3OZn7hcEqmlVAE7TkF06kkAzut1GDN3i6PL8xRnEPZGlwiVC8lBoJCTPK8RrOwvkUAWkCd+lIBCvK76T2W8ew66N7Nk0rfzBAWPTC7jpYEFPLZWrX4f0lGccNoEJAto9ZyOq6pi+0dxtFVQT3Ro27xjwAyKpGjHYY1Hqe0xnISMly9Evzc4PA+rG7RUNbgXJPb+Bu4vZtUdRUwBkVcAnyn26uZqw/QTRjX1+I0H35eTMa829091oVxN6XTcLfNAIX/3uIJAG5oGQsf+b5Q1SGwbqcQAuHRzw7nYQ1ZQRtmM9ikD51sE3/npWOQ0UKon0B"
    }
  ]
}`

const MOCK_MAINNET_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:xy6TuTNtEczftnf5p1H1X2rl+9KL55PpwuMD9uT1TlM="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:W1xMUXol/AzO/7aOYXzy4J07J0RcEkAzFv4SYZDzOhM="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1681339586809,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU6M2j0hVCq6ahpLWzVV6LcXqGL07MdXnOtsh+78kA8y07FOwqNNoQYOZUX/XyTCv3EnrgChr7hcklZLIwN44aRdjrMpQvpGercQTE2q2xqORZDS6Ejf4TTUdhzAzlNMeWgC1/d/WqmJZr+ExBJRZdDAb+kOVbveYN/7E7huhmN8S3w57NZw7+9BCLwOp0rK7zMcFQRRB311n+KUqn0zcSjm7SBrO84QwLbhkGdEzdsutXIW7SxPYGRhBuHlA0Qrey1fiKFtNKupDHmYOiCQiWLpjwfWxPSvX2wb0tWilQdu8g15kNHrByvOPh+u/uU505GR6y1aX+POXkn/6+i+Vv2AClkgZJpvBmaAvd+7UoKLuhMiArUYoQs9RoOPkyaMMqFa1X8exqyzMtYOG8hRwK7khfQ/ntiI+zRU2180mHqT1yizXlJQCBqCUUWJE/bTnclVerWPs6yT7gA89VJu3A1uzM+NKzRl2LHw/ecttcx8DcFv517p8Vtcao+bwmyheUM9aOKfLwTpEvXQcqPtX+XMsu7dKXxB8skWPzpMKgjfhtXLf23kqhb07+zScK0hyRKJgrhAwli7Iuh6an0937uPda78bir4YBBHOKeHP2z4guZfFx+/CdElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw+JXrp2WV23ViZuydPcGODpA/lznrz+aQqmfVB7wEf6caiZYQU2q4WPMah+sa3RZUGlAtj6lkbQse2cSkVO82Bg=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAABPbDUmTdOSsvgaqDEaU88qX60I5cTL3FlmOJ6scBL3K4Gj9fXrePdsp+pL7zvZIW7jsPWtKoB15O6/hZp5qKSaI5pxt0bki/COyIf9msfS+ZjRTjXZnM4i1a8WXld1Oq2QQLozz1tbomIwOs6CAhjBOoGzc/EOAErU6VL+xPl28UKsrXIaKydEUgbIstutsw+SAd3QDkwBlRjFnN/DEkpwhgD6nCqV19Iz0T26Va/rygjIkAoHCj/IvVTAhVcFQedQwBeeRSq1bBLaJz2wGTnmg/7Zf2bsDjLrU1GwCsgi24KOdLZYZMfzwvEILQeg3582ThoKpdFGdlsT3pyMBzE6xCJuyewX689Q/2hF4io6flbmqMvHzHEr9x1VAwVzM88uZMyMn7Jhxha+/zlBlL9EG+WcrXAOfRdaYuoDcIzQ/tejG/p3McqjlDdMZiJG5u7s2Bq5mph9OnlOsQnrKHabr6Jz5Jix9aUOa3N+RM5gzXpSw/qV44N7UULGJe0RlNR6LOE277tXZhfuUBeCwslPxtigJ7rYzGWaD2xAmhvZnWxVI1iyI3/Wy33sqBkFdUS7fPawfiBnRA2plR/SBK6ENNs2eeh9ynbuWDaXrlDt8TgROzssd2BUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw7MOjjidbGW+Lj7KNjgagXMCeHQlob3pfxaMsJio4oQX8zbgrsKIvf7Z4X6SM9Le4/Gesafy620AdneR/WjjUDQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAh5BLqtxN9HAYgwRDi7Tfr4dK+OcaLyK7RhRUdu6puxKRbDroatx4woF4rI5BLrQuat1hTH53jHVyoyMowAVUAo004Yr3iyUQDc4iREEhKZirGz7wctSbjqX++U1Mb9gSYKimiz1h2FX7/dmu2zLcwAEC+Ab9sNJ+p7QoBEnphfMPJbKMLy7cuEadGaoiE1PfpLoTBCcyal56ewCvlcpY9yLNXXs/tzvVQQrev3jeYTqor844gZTb7sgPUkvUN2ulzIEqkJDsXy9JDPlQfA6jbvpa77NF4cKmQYzayoh8+hLwqhiRWw7RoK2wNI3Dmnqi0mtcnq00p/Ynz/AtqVjms8XQhe6q7pE8wJfSH2NpBui2Ixo2gPUA/AS9CIoR0e1kAgAAAGo3VcZejtcEfG4NR/5IbxY9B8dQgNLXqCbGZZQekx1aVqnjeIbyHOOMcMr6eLgduGkUN/cuPfKhBAdIfn0mgNBtlKEzMUiZQt1llA0fCrO9eAfrjJkmvz0TQe2Gx0LXDKxlToIm5UYmMZjqdFD0XvmSHBOxWpIdO0fW6A/TsPcd0D6YoqKdUfqsJDb3WjUofqOrOLNOYg1rCPkPIgzJmmXUFNxU23/aerEg2tjxJa49CUOWjVYqKlVy6UR6xytg2AbAvyQ9VZwykEnJBapi25K/Xloh5R0qYlCstRW4eabUMuwBhOocTn0YuBvzo7mtFK16x2YflwClWfb8sRQWFMSsHSik2eggqyTpGfxEJAb9zk05M1kpHGKeC4RWANdAgzv3raaNXiKg1k7F1EN4wly4K45ktVXAiBeX5OVNlZrRa8uGqj4PRtR7SFbUa0SBCO/feHL6MqXcwXm38vI8J2QEc08/pVf2CII1MbCu4YZ9ydJMmbmgy8WpTXTmsP34Cu/qDFxVbskvyduPdCpOuvVVI8d4k72yyoSJBxaOXmE8/2S5X5zYxXDeJTISkoOqH3rL/VuthRa4iWSrOVbETq551PVdENGbjUp7kBerzQf3ttFkKmwS6eCzg7aFGkW6QTZg6tY1q6bEETCAMio7lV1KAbGjcQB+dLXv3eYiBB4gp5a5WY6GQy1WBIoYaUAPOalgFRlNdFDrHYLG0Sk6jxsJeSiedS/DKnWdWF/1U4mrmQQ/WGhitZMuockFVs+QRqlivO0IhBHheN4aoyj1bGZT42XdcCCdFK59MiXSaStIkPYSY7wZ10TVHkWuQD4DF4OCMvjzYLX6NpmgglfXqp4xD0dYHGdhhtnujWixEfpQscKZ4Uzj285jGJpE2rWpLclhAOkcz7gL"
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
    "genesis": ${MOCK_MAINNET_GENESIS},
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
