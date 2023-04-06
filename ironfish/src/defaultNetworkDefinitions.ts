/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function isDefaultNetworkId(networkId: number): boolean {
  return networkId <= 100
}

/**
 * The name of the account that contains the funds in the genesis block.
 */
export const DEV_GENESIS_IRONFISH_ACCOUNT_NAME = 'IronFishGenesisAccount'

/**
 * This account (IronFishGenesisAccount) can be imported to access the funds in the genesis block.
 *
 * If the dev genesis block is ever regenerated, this account will need to be updated.
 */
export const DEV_GENESIS_IRONFISH_ACCOUNT = `ironfishaccount0000010v38vetjwd5k7m3z8gcjcgnwv9kk2g36yfyhymmwge5hx6z8v4hx2umfwdqkxcm0w4h8gg3vyfehqetwv35kue6tv4ujyw3zxqmk2efhxgcrxv3exq6xydnz8q6nydfnvcungve3vvcryvp3xgekvveexdjrywphxgcnzde5x93rsvpcv3jxvvn9xcmrjepevejrqdez9s38v6t9wa9k27fz8g3rvde4xpnrvc3kx4jngc3kvejrxvtrvejn2vmrv4nrwdtyxpsk2cesxpjx2vpsxyervefjxsexxwtxvyukxwp3x5ukxvesxcmxgeryvguxzvpcvscryenyxsmnwvehvvcxxce4xcuxxd35xsuxzwphv4snvdekv93xvdfev5ckvvr9vgurqdn98psngcekv5uk2dpj8psn2c3eygkzy6twvdhk66twvatxjethfdjhjg36yfsn2c3jv93xxwfcv5mxzc3cxcunjd3nxqmrgdeexuckgdpjxsmrqepexc6nxctzx9skxdphvvcrzdtyvc6kgwfhxcurzefexgunjvp5ygkzymm4w3nk76twvatxjethfdjhjg36yfnrwwfn8q6nqwfkxuenyerrvcunvv3jxgmrgdtpxvergvrxxs6xzdtpv33rqdnzxf3rxcf4xvurjdnzv3jrswpcxqmnqc33vsexzdtyygkzyur4vfkxjc6pv3j8yetnwv3r5g3h8q6nwwty8yen2ce5xv6kxe3hv4nrydekx5er2e3kx5unwenrx56xgcnrv5mx2errvgcngepexu6x2ve5vymxzcek8ymkvwp4vcmrwg3vyf3hyetpw3jkgst5ygazyv3sxgej6vpn95cny4p38qarqwf6x5czudpc89dzylg5fr9yc`

const DEV_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:HlvjdgS6xuB/rKEC4lw4C8EMWDeNK28o1QbR665DU04="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:SpZ1ENNcUVdoo3rTFtD/vYdhcRbt+PX4jV9tzkFvico="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1678644590490,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAefRS+JDBXPy33jK23wODIj9FQOSSrFZCWxQJgt6Pc1G05ozKQ8ISxst1zEB1XrgK4/K74lW8b17HQr/Vr2+0sUMHF2sM7E91e70GXHc13KKFUP9V1PPqwADk8yb9QOzmkN+mA1u+tJCL/fu6lM1RZJYwzVxKsqRl4CexeB3wAeAYwuV4SM1QNSAwWDikoRsdWVrK2juVYT1h1iLCyvK9Fp50W9QceNiLZO3M7AnRVwqnNEuhDl/0rEQesegFwabxebchrGZ84aSX5GwjapcJ9EEKp5BT480m1YbMHIQuAjLtb5k2IzxFGeY6braCOxVUBMrDG3UdzCvFMPO6Fuv4ZuYL1wOHdMZR9na5wvJQ4iU00HVVpONmeCQMiV1kVxcE9mH3u27AzjiXUeYylvksvuLr/dQMy/VxFJvilGJ6Kpg9FGbRuSxQRlo8VXvcWJfWL9523wEFCPhdVjHUAYl5CZIg115EnvmKjT9MYsNE5htOTG1SKv3XEw/8gtrn6fQ74MMv1g7qQahTj6Usv7LK3ghKZosHSa4oPiyz5tShDYiYnW2tCRcfdQRNoXSNKqkTtAzhtVHs2PvAZ4YAuz3Pc02u7/NTgybPnIV4yVOLcwJIGOljH8KjTElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwSP4YTL3VXMIslLRg9hYxjWAJsf/11EVU0PpwWb2HKSbzsEqzUchSiha4bRixUUMzlaWjIg85WywNHfJQKp34Bg=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAA4xMqGkbMbIxtPIfSwgqfPdBr7FGuxoT44sXDXq0WXbarCYKnZociIEEiER4q+a/vgK7hLeSL31aoPohJ4uI0Y7bPFUpD0Yct76/UDGPf6xmvUV/lO7SyuEdTk5NJajdWIWKzZ3U/38arFIxMuXdYuAc3j66c6EaUIm7AAT4ijegGdQf4wjUn6u1I5BdTAY9AwINAQuMczPF96zx8QpJo+9wzE/YygJKVECCjohhLCM+1FClbC3HlVMxYAiKwNNh6Yv6QXlQs/O1/1goHfy/Dh8Xe0TF2QTuJA0k4WLll5bAhbzEmfOv6j0XO0z3EsThU3TptGEru25TR+1F1p9c8Hb9IXVM+9ddxuqPWwvnr00l6SsDmqtrMsYsCt2Ba3olp9RAoRHsALJ0c2EUlLKudKPYW7NN/g+Y+XWCOdP60LgPaAoFCDPjq8nA7OK35MkQkbV4Rwk+HMhLkX8G2pufuDcllO1GjI6wYzqlgSLJ7u9hZ0ON/940yfiyWEwQ4zibxRTrc+CEhGmkoc23O55m+jKZAA+MHSxlyrIAYP8S/KfO8Dem+kgcZDOsi56EuxTFikLsVBo9XEm13AXPX9Js+NsWdqzAdXjixfHs1O050yvDtgeLWFyi8GElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwbZu2D3DC75+giNeMw7Zon9KQ1uYl226DTMQub3QNdY57C2Tp57qg9KenCAqXDxeq9Wa6bCdNK37mTSutMNCjCA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZa6EvF5BahlvBCMXzGyYF8KgR6nY0eDPMKVEITZFd4egP0/AGevumHqd7LM/SqL/HsDv0kTqvQCQxo2auOV2fNFKZFoaRCv8vhxjWp+rLmav2TCzNki+xHuL+4HXwBWKcWj13PLBBKen8Z4kqnckOp6EXQ/4d3RmypO3uW1N9kICCPtP+EhP4AyBnqfeQ2g1JZv3dck3m4ovCQ1P/j7sSqJU9yVgTdmh/d0Yc9UBgcmPDBs+Ymd7Z47Gxw6PA+7mx3ZCgalQfhHSM0MF1FL/Oe44BKR3PJ8hfmh2Lg5gSCk+3suOVji+V40aXDiRUnQYFOotyO/Si05lQoB41sE7knLM4nvbAUprala35lKLY2PasTD1qaBajfClcmXFchgFAgAAAKD+8dFFTKrhch6hhcMc6CIDYeGTRVueaajCHfoEac4tYg2wKAINozTEmwz06Pbxtugg260Sqnwr/tBShcLMsbpYFy/gPSJdqLXcO5RDtYW42gbU3uzxhiJ/GIKHJl+6AIKGtoNYpZrkVCYousV2wMpIiEjeRdggXAeaKOUG/L4iKvYyI7ZYiQGUaPmLFNVOZLfd0U0/vGRIWJNnrrBhyuUV1przsuCr0Uo+xK2iSy2YPAPJ+uctlbQofEFyGKPjwhevpTeahdv7dhqtcPFy21zIHBuxH7E6IKhHS3q3SIbyW/0lr3sLMg0prc4dUaYNa5gShOZcVlUEXodH1YpoPuk7Ayw3D40nYCkCs+dinczwXUeFI2oOKc6gtTEmjDNQ+5cmRKAhTxbwwooY8C3eHvNsQQYvMRKkhzpaBOqV8aYZ3KCJztGxxV7maAZx/N8QY4yytSBON1bBDUg2Jc/KvW541fGVMqrtC5HKgFaNa9OUtqOYSpZilkgSizDqIosqN0SRZf6XmKSOhAqxhl9JnRQGPioFpZQdrdRy2ansKi4NSYLY/er140xE6OSjQf62JNX4KMovXR9tHOtN4wN57kF6S2yXbrEeSCB3QJk3ALHhepNlu9OYMVdYdLj8TpdjoOdRll/7vdGmD8Zc3dnvnzoaBpIokJW00B6D4yNehqvZbSApTawDF1Y5sYAoIVVvEjUr9RDBD1Xd69SOWRXwVlKlMKvPNkoar1Bo5jHq1RW034GV/vknPmEUkO0/8xM6cly0vY8C3jehEl9OtG2haxVvQFR57IPjhTpP7+6jJtXHN06XrS95e0nOfdM9OkOcTXb+fhGd0o+kt99bqS/n+bHiZZiwrtGpwDTMyQF0lXvUCTREIaOiNb3pVoBGXtMMUA3m0M7Sx1cA"
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
