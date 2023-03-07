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
      "data": "base64:6iLRirJBQjfOJEEtTS6dhGnkthdj/h+xgcLj9P41lBw="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:uR/PW5t49mCidTFvgpiry0ywQR8tsLZBcUKQ72TT0aU="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1678218187741,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaKSUd4U23TyEYvusa/GFfUdg0aruLt7JZp+Bmjn3ErmRoHAi+/qdueUWujvDzXafTJf6aCE3n30lHuksHiQMteT2C9Wbn6qNu3W2py47gPyColMxIe+kQqfHO7VDEqq141FJQNuybnq9lBQhtBUqGjIx2bread8K0Ovj26usJ0YErRU53XYqwQ6UGQf5cTkp3x1PRZoVTdjdRHmALnx6YqOv2LspqgvoKVe8wpy7hCCFKqTvbNgPVOwEz4Nh1peJy5PRO/J0djsbw/ggDthiSYUyq3q2r5QJ2ECAXCnSMJN3jqND4AxxcuQX/GZLV/W7uckbhG24m2pZRyU+F4h84Ujk/V4Stab4xyVYbI7BxkE8odP5AYYSE6UvP+nFz5okaD+7aThpMsuS1rhiHVmXSISyoAoh9Dc5NyUJMWjaIUbyjvCwq0Lpky748wBwtfb5gSt8GINrp2XOjKT1nUAjfn0bEiWVUbSGPLtsBIpkHtOPzSpR0hSlWZA3agkbkVi/UbWwU74GVJfFC4E2HSUNbrFXMupCbx9zkQJwXUfq3MbKmpGIn5j4lRFldvxm7Il8JVDKsr4qBqO5V0e5ObuTflQOB/RZHxbRuZlskHiUapOZrS0flaf/CUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwKfUeGHF00nMZUZJSAkUgC4+YX9dgDgkKJcIc/ZTu3jN6OQlubfnrKCjDNVBUZ58M8f0dBT5M/iTtDOSHtTxPCA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAeTPRqSpS5e3g55NyXH6vtqQL41QT35BazHQadLgD8dCFDBym7Es3mjoMr6jVJkiZgJASUQWMOEMW1SbarNcT68GxVIcUuipMF+d3tKi30kuoNaEkgFLXzJOJUkmrObzI3GEU4XMtG9tu/xtShySk+EaXbDnRvHN/2qDBpZd5HJIEF0m6bG7B+WqiBJnky5SoHGScWAkq8QNZiYMgn7E97HdLjuJfPU0qmE7rL6BW1FulngTY59VvV8H7pC+4HD+NcmiJ3zjUqFEX2BdsBCMF2l7EJrz3x8ACvJW1AnGSTPIWKMJz7eZz36LGdFntlEu9iDMy4w1YQuikemtvtYQKGy1GZPvaeZEwLYSogh+mW9HZmGF93lSqjfmlhwcdNVlvK9s0HAwfHY/cR1QUussqVMg/ZnS4WgYSuc3DSPeDGGZCDMZinpz/UQqFEKjlPSDh3uI6G2NjZ5oDsKdFPmNvXwgD4gjSaLmVEayiV0Z5dWsAkMSVg9g2YCRkV0rafNIyU9anCmcgtmeaJ/1nZcU4HFQY4JOWQ83L693wnj0VRMnWqtrWrsYJHjA9C7I8wHRC5o7PS0CO0K9DVaIPcnpMyDd6dpw0XAnrrkSF84Sc9AEBAO+N4+85DUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwfruVkyplnmvGJ36ubmxymcMe8iROwpacgHIzhv/9UIO209D41Dw9WAT3UNEd2+vQkdznCwyIKrNeIGD1C1OYBA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxlsEMTadOfVV67PCG+5i4qV4nwq5kXpkVzv7kaO9RCuHcfv0gQRs9Fcbir+nJenlq/kfEF25u7kvTfuI2XOLNtmkZgRSAKrwKTGl5hm7I12ZGQfjcIqt6r6VQI0lcwtWQY3WKIEKAWywfKMZvD4eH/zWz2b1GZw92lKZvlddO0cXTNoYEPZJP4gx2n6RbMs35icKAUaYwYch+4SR9KiOXhjLrW+eYVNPbGBbj3Z9/ZilMkgqqnKdXAe+AYdQ8C9vzcyEWY2yJ4yYZVwTfCPQuUg6BlUx1uywV/A1MSKwDelWIjmIy5Q29sMCv2RXyqia7v5EB25fkMGYUxCPMRsVtrXwbD+bim+kSm8xNrIlA0b1+htVj6s6yffrkALtSbBjAgAAAGw4xv7kL8jUuMJ7xY6926BsaMHAREG8MXU9vk3AuUl07lgtHvWV7B2w3e4DL0OubQRM1hZSaFgT4JdFUP68d0sdJ6SWQ7T5C5ts87QZxqntrQrsLw2EiN1w4NHM4z2vAKtfGRXV0XHllJx1M85fq9g/J+3jzBoG7xoap7wzb3DEpe/yX3MSVdcCjnqXmAEWP6w32de7rAJd3TsBsHUyy/sW1iyvdJqKjj5WcWUU5PYDPA4qX+8gOFkAZvYt1CtArxUQ0Q5bg4jZDJIizMzgCSI2V1RWhndLNi30OkZA9DfayBN1iLNFCBw6hX1Suisyn4m40ORTUpi2KExpW2PhCqPjWoKR/4Zcc9/amuyRqGScP7fk2WquVClPysmG28G/on4Hoy2yf3HqjWvjNjPIfXDL/V/imjsziJsuP6euqk6+GWcDGDSvLJkiTqyWMz1+9BUBNH8hZXA5/9Auqmu8jGBnVxh458hpmMaKKyYdvfpYjLMBi5MQr5/ozSmxIt3u8go+3uC8j+DUjZgib1gsm7dTFA3/B5UhksU/+OW59j9lZVKtILldrKSOnlUQ/cDPWjUQN08c0+sNyMBxp5Tq20EhVee9Z5mzZe21XaLDZ4Tj0+jR4+pBuT24PhsUdsB7vFsk91H7DTfOwU46Mv6ZyzH1fPCRH/1/+rW/q+sD4uK3pZerOLk0LG1gMtyuV4RhmgaWf29isX/YSzgVpWMPaKVQqt7Xsd5MtQaig4Z2QqfclUWgiha83M5USnbzaUjBeIpWxIUwYyBo7uQ6QispEcYhEkUMnrLJP4VUM6vQV6F+HhKsn5hGTQrcYudvJDVLtaws09y/wgHX9piFopXEm5A3cEACBNyHnTNvFdNkRGHzMqB7Hnv5uXQOrw2GHK8V40b2ciCw0HQB"
    }
  ]
}`

const PHASE3_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:yXHmGmXfTDNOoeqi2+wRvjeumcgY47QtssmADoN+2jk="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:8478I1gWyhOUfVtjBIrnlv9NpvjxkXyMwRZL4+tewRw="
    },
    "target": "36759393408671808070974915875773939001038090370044623504589709208861",
    "randomness": "0",
    "timestamp": 1674068849536,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj2fbosMDyw1exkJrfiTrwHB3M6cp+yRqqXiwjlkP92KJsdHZBs/UhxNgYd7LuDMgVSysrOHl976JmV5ob+N5uujm/7EWxFZBz9Q9FbG3DvS2M5Jbej38ABBI2kY3u+DgWWyyAoY/pa/+tYAjaQnAJEwFBZ7BA1wJuC1iCD/hZw0QIx16MQt6Jee7AzCYWREV//EejK2KDb4hKBHa5PGcTLtBicnJKQ3oVpg0uPBT4sm5h0oWGGLVTQqlfqaatCwqHL7KpbPUcECGYGRfc2tIgtHBiqQcXq667kSt+10ThiUfQL8oBFn+BCBob0Eh4EnfwjobXcWU/POkseJ2hWyWuFjt7Fa3JIsKnQuaFOik+TqJvOQw8DHuwhAQIrAeUmZB3WRvTmz4BWZmtMfYo35eDaeqOnHuxTzVl6FTsTi25EQRp5/M8BLUTGhmRhe2bxuEwu5SSfKV1+C8cSP+3Dtyu7XzIOYRaShoX4/QPk/EaogB7o4YJFrEVvwJo3/nE0BomlNWyl1hzJQ8AwPmpDRvL3uSVFJPpKc4FVypusDOzadeJY2ZgZuwCmTOyWZp+PN30UdP/KCryOa2X5XBecBlseH5n3CyjVVA2FWbHBz27Xh1stfvpp4RHElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwzbHJiN4EsvuDmDzSn8Wn9I96n2rJ5AmsknnOTQR80rAUNTdaUtym9Nhz7AtRBa4oY68BlDl1+ld3laH/jN98Aw=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAeux0XugwJoZNmrnXim1D6qM1lLy/KuBfoC7lmMjI0i2j2UpEKydExHrgZgI2nvomVxJQmjDa7AaKV+elPk9mK9grSL/2DPcFDSVWNNwn9riyAkZR3DgG6ZA7Y2aQwmUbzCRHkNhi4uJ9HWvHONbinYyA8x1Qn2lhxBfE4LkSFOoSB2PaEK+Z/xnZDnBpfurgcj5wu99B/roQ0zvH3dwyv2GsQKSBOEh1MAuHFy7XAKG25Piw6Ogoeq2KTeVJ1dwHFAxDAZKQlTH0zjpvGGeGg89dDV/CTXb8ZP+BIWO7pfSWJc/58lrk7I5kAMyKbX7gaSZRWDL2UJsnAqnkoGePEjI7ZXg3ypTqhDXvv/RZGJc75j2hY0pSxjYgzfo1Yzsca2aPimOtPuC1AZqX1QI3zWJ+3auAU/JjENdCFBinUR5gaHxtKlzz4834v3Pc1ahBB144jXnu+JAhBcfVX13/b1B6FivRxoJAnVVK1c73ADL1WMae/2lYWQHFf7k0DCARfSOlLbPo+kIwxdbNilZipUgSN5lONLAtKeYVUKC1h2ah/RbDKNqfqTa98/xsDwdqFb0NpazMg4ZQQo6HLK0Q9+E1F/oK/sE6jzcWmA2flWrYk04XPGqYfUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw+5HM0NP6yra2vVQTlrIA2X47PMnjlz/1i1STGES3s1YR+oEmKdO9Qi9KeEFr7SHaJxELPw7tLUC+IuUzogKUDA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwCRsEIRKW1Wpv1U4a1qp/v6woYiA5qwbrMDya4SUwYezQkCXOKVwlxhs3RxRbFIcUOky6Aqp7gTJ32uiFioP8/I2IkZuVI/FTZYL9VOJdVKLegm6/q+8a4z4mSu2AvMSwrBtNpvnVeQh+72xiu/P/7yzkxFNZiENRWF9lrvYrE8XvMFoTZq0siZdLRM1ODnH9+Usf3UZLXMAFMCSbMRg4qk6UDFj0R88XF9fijQfW4GIVtTrI8lWNgFWusHJ2JccBaY1qUkE15FFWTSp0DCofnp67TNbOgFrLjSSMZp1iLDVKBmGhHJ9fjLFVaLiykjcQ4D05V+QpJCab3C6NQowjF5DEYmfzS4SXu2McdY4AYmVCPBaxG7EEUK6/cbikN8FAgAAAPr7+/I3g2aS1tLOydDhoqNaa6qoIwF+k7x22piKUon++nUsQXQykZs9EAoed2oFFnpPbRaSv2cgOBonKKWgJeqxVFmkGhwtppJmmcH5D5YE/ii7VqdK1VJENFImJgUoA4wdEkwHS3TJMBugBUvn7Io9fyCac/6rCLww9n0ScwRMsP/Mv/ziJsnB8048qrSW77T0Y/sMm+c7TP9Kqs7VqR8ZgH2nDqsf3X8Ss4puJSaqGnUR2ai3LiZkD6PdiEe2JRNfjAvyx0rikfD+boJmjYQ+C4kl7W1DlNDA1538+/kTi6swJObcV+8bGoJSfbQV2oh2GUa8Z1aqvID3Gfoin+e6VPh3Y0k0l4wBXv0JUnqC/VgSg5ceHu5H89DNoDKwtk5un7gJ6JJs/zar62suLL5tVKeSdVxi4rSJqcZ8/GkBZ3+GVjOve0NKbT/zho8Ftzo9mVlsm7wye0ZMc4ec3Vb/5z/QlXsu9hdVfasp4JBrS5zUeyd8+YlKX2m6vfFiTUTVrW8e/36ID0iB20Py9y0MSbh4YMsL9PCrMZB9XrOgr6WjjvZGjVoSJKr1EOFZ7COGs037fh5+nNEBLNV1e/4xaxXaKOJV+rQyg7+/yC7eLgAay9B6E2R6y1dBveGfEBkIIpJwvuKetS5+/rtwXNTNprAdU010d7h9SCVNf8B810ENm6LkvN6uRAn4Xs4br7jvLRCZEEIRgs6oeAlGERveA3fKDdKtVbQAwAKq03yGSDWH8QojA4MVpEs9uPTX/n19Nf1Td59ouVuE7XGm8FBXk6JOeZhTW1nklbpWmP7y4NorUTecqMurUPXCQGtSMak3v+0J7jSj3o+zZcZEz98Z3MSKpBoQl9QnxppeiiuH0QxM/TjUr67Y1a/3amUd2xYkC27Oz0QG"
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
      "maxBlockSizeBytes": 2000000,
      "minFee": 0
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
        "maxBlockSizeBytes": 2000000,
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
        "maxBlockSizeBytes": 2000000,
        "minFee": 0
    }
}`
