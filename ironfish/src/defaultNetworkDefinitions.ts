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

const TESTNET_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:ywIsLQWdZ/XnP/g3biPQOWKzopjOhQYrVv+ArR2YnwA="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:Wcu+RvUsjWdkmKHRWGv/nPsr/ABIUpZG+fAY4wLnKPU="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1678227692542,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHZfYziXpH/hzvqIQrb239z3DROFIIi1Xyk/6cuKQP2SoDfl1g8KU83HqeDkPN/5/8Et+OtDREBu+7fPzTHTkxWOYsCtX6QDTgiAPhkA2DZqgp0kZWSR7h8X9ypBTTzjC4kBJH06pMsFNqIJXykQnseUibcA0/7UTIuRUEDmKSEoC/2RNxUKYZtGSdu+XYJfVfmzwBnM2PeFS5MDEKR7jx7yvjRlQ1VvVduq/sYlfx7ulj8AgvA4ks+eOax8+GNjiD3cc/IwfaMd7lOxt7bB6jb4taxW0RYY6Owueq+hH8M6xbLiTxZRr2RnGsdFj1RXsvMr4QwUTRyBNFQXLPy9fIy2bCa8/0rl7Vf+FZSzy44EnuDvbrUNLQ9kNYf83IR0aIa8Ap2LJLy1njZfXTUnENO3b1kaL9Aqjs6VGZC7N32Q/mEFo859YFbkk0HUWcln1R4mG7Ys6gw+oljrEDNpWjaJmeNnG3ky0TIUe1ZyQPEC90nhyGl5iiLdd2T/89owy/yaxfBElilCPWhQxG9VpJpV2pGfhumyXVrxtoZX79J3rfm1g+xNDLrOau62cnTtJmu6rXTaEmVzqAKmb5hkGQG7N2tfsebReSw9cH67t7jZWg8cije3tv0lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwy8eR8cWvooeAfUTiSMOwodZctWh7GR8cS8mQ3vK2kusdJJU20t5q/v53XpAO8oU1NJxx3IEo91BR2zDGB8E/BA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAA9lWrl3NAa1gVR9oujGkndtNuD1YNVznvMlzWdpEBu1uszIqhF9Lhlt1w9GV+bDyRcbfxO/qRLauAMvVn7FT/pN6gjlb+f2z4LZqCyR1iTcKo68LC6/HOGhuL0pzkts0a15ZI06y/CukeKw7Eml2XxipB7Lt5ulyLVoEtBT0dmowVzgAm5RWtgDjg+bgxY2Gwkm3YVlQnwpqZS9Wnw03Di3iu3izCHzgPtOruAEAkfiCZ/7h+q9pgyUf5ZyyKVi0ARZQmiqWWxwI0eeCxjXTbE+WQKc/5pFCw8809of+gi+9XQw3y5CkBqTm/PjRl3xWLpbA6rfbFuuDkKFG+q6sQ5xjC3nzvvhs7KctQMcrDvc8L2pothUX07fV540xwx24+Vm8SU/nUtT0qK1fVB0o8Yc66ZHwSJedPfXageKmjOoBi3Xy0ftvEm3XhOKokusxn3JHOceM3HiLugg1j8na8zMwLJgdXpSVc6qY6ZB3/cOSgVzr2K1BvTLgUAB0Epn8EvaQiQh+oSjUM/ezA9cQmo3Ytr94kpeOqae7UA7RQgQzHsFxwbaHVjFxBaHAwsN9vFxkda7gD0d9Gd3wTUeZNGAYZQRQx9lhtroG6ep6NUUcVLPP4AY7kgklyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwiJwX5M4cXIwkHmb7ffkamBqxJyNt7e3QlZz5Rd7nK1paTtfgngm+Hd+kVaGvarJcJYunZzcf7sxfSDMa8FVvCQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8kVLNgf28sq9U0jIGO7RltXNpERyL1EQnYUCUbDbCLiPTqnzKiU6vYk95nxuTCRuP0evDroItKXwt6U2waqZyaWi7XaGPcW49eILMgIjiY6N3OZRhKumSP6V8eOr4WfIWf6TitvbpuFXQigWVlAMh74RCK2C5wfXGJob2sjhEF8SbQRF+YzsYV5NEbsUTg85cZ2rybrUZ8GazpfvzZ41sxmyfCICoxVEOtGervKSw5iJ/h/DNi+S/RvYTePi5+LW9w85fRSR1OM4mJbp2irfDxMrvxRWpRYn6DyNU/3qN2Afso73BG+62NVDgxkL51ZFW48Cpn+YEGjlPm8IFWquD77ys34avCRZdLFFo/amPvUdADDznyBkJj+VPBQSFyAyAgAAAMAJ5F/WTeivrGLLJ9Tfp+tD/Q2ErYbWUQrQd4/f28uqSjilHaUEdstcIpPQPkOyEmABwuGsdMLputlEiKwnUpXEyQemTHrWfJqdTT7mtMGg+99EbtHEkzdTgY0jBW+0A6pVP5uYXuqjAsov0+9lgRn4d1DfiGjPm++yPdoxzvGQaxA2eBfzWP6Hbp6J/yhpv7Uffs6a6GoUixkIduuiGHa76x83TAPHF3ZpdcDM9tUyIFKKa3D5vh6TJOkFjTpA1BP5J1IPikj1bsHHO/Iq9bcWPOCJTaemj/ojemhiMEo37WTsBmqa7d2bOVm9nIg8CrWDPob4Iq7L/uwEWNiIyKHgSbiGNeVLadjAOfUPLveEo/QYIhloAwc9VeU0wrrn2CKVVjgMNAGkfejY+WCEhooH3Ry+ytb9p8SXEllMpwbQzGwzNe1uVpvl4dUEGAVU6nIzXOokYt7J9d3KOnZRtnDh8flRGvtygsnNCnWJ5+lqYG2FX60VzjAIHCImbUv58YYLfWAw5QBFUwdTHNLwWSj8zxloiCVHzm37VQjVyCRuE95OmPSnH28IVPYKwNvshruqyJkweRGGOC0IJEq9V3kO36ZVNzUbU2/I+/uutb9zrL8W2a0zceEa+O4OUp4EMjuugSCYPjKX7Z5Uh6pUFiKJokAvZ/ANHUmSnEisXFlDbYBxAiPbZig46m6oNl5LZswdh9AA5eOxiXxKvT/yRCMiFA0MHg/yZz+YkBiOZMJ/3mUzqLpCKWFZ9BmiDr8aYJN42HZlCPruYouV7u+bvhAow47IDgQr22W30cVzbyBX0KL/82FiLwoxSPxShJE+VJNuqVFzahFe6ANLZaX4LNP33bB9Dq5ghwY6xuSrKtvRedERwY82Fy3WqOign4w07USYPHPqf7MC"
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
    "bootstrapNodes": ["1.main.bn.ironfish.network", "2.main.bn.ironfish.network"],
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
