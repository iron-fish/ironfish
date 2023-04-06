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
      "data": "base64:mtLBVjskRqrtPIUlomEcusw9yv/+YLMK1/w8UAfljGc="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:8oYkX2L4dIy0yQGykMnH2BZKCcAUGLG4Ep2oP50ZDmE="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1680730276445,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKloPP63eJQkhbvFor6TfKo2EeI/SA+OVDffXw8soG62JA4u7wM4ho7+pi0z9iUL0PCAZwihjDAOLPWt/iuLFjz2iFmkan/4qBAZ5FgUSY6pJ+XGTikhw5PNf9Ig60JUVx41Sg04lcNUiwWVimyv+UubLKyxbHEjSqKNlMdOGv0JKtbs8fmJvqB1vLCUx8rX5V+avwIF+i7ALJ4NLegSZBj5kVrH586YdTAtNVASue2mEEduszw7ykzqxivL5xzkRs1Ez9EvnaQ1GahEHlKKX0y39/wMPqmtqeaKqfKetmd7GLnVW25DdS/C9U1vnF9R8QhYjGxDm35gAcXS9hjRstF4IDLg1nWs/FoUdMo3LMKZr57kU6tJBBQHu+rpavFciIgrb+JYQrr4bMjgeONqYOTaKpEwJmVavEc4xMsqzWgexdrnOxcjw2YRD0MaYUuj+mSG4XmFSqVJQpgMSYqPZ4gzvBEm9cS0JG/XqKF8e9qBGm+C17210hajaQHDlBt8UeeZm3veyqDMctJ4VO0JVy9y2LlEdd/HD6ZNkk24bO+RuCtGzUbcMoXWbPKdVIeqJz55sbEItBz9a/720kBjOeJBzCxi7/5gd16ZZMqBT4uHHlpo2Cs5x0lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw3J/HvNivk488Sx9WKk9RgUUAP6JdFrI2FzzpKq8ZFgSGbPPRgXrfLWFKclJQOjrNXuagbSIm2Dg+KiG1qedUCg=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAA+/eTWT43ux3sGrcnmSMVrOAtWYTCXGTeARb2tUGzNg6gQUWrdXQW2cBw7udWJ3z72ig6H7rd3VaVCvx6NnKX0lHkfCEus0QG6sgDxvZXKVCODWoGMzAU1O1P1S7akdaFdPyMemcIxQSxSx4RDKYeJ6WPiZH77v7PTRso6JODLjgCb1wrIiGetwdkhSINKiEYC/kPPx7cEbLwAzsFIPL6Q2s5VpOIlBHXUDxwqH+eBcOP06kQaQApf1aRrv5BH5o8WRTMZXSZ81bqEVa0R5FerJ2kwUSc2QYYs97GuEdwWATLfRmTfgq2TGtce82RmpHIuABoei4QdSVhp+94/z/l5vhoPuSoEcSEQiVMjZKPFlAiV38ldfESdsmNjEP49Mlvcz+nkYjtlwLiQIWTSpy869a7K0g3lP9lpDEYr7iG+G1pMHW9jh5f6d5j0AdzF+bbdlCFbCSN25+3GvE8ihEq6TZNWEMpmQYfp1MTLakS7AS0LkFKtsW1n3s32uay26doXbM/Cz+4FW1gWGlfxbZ0LCOfVruOePup2iLPh47Ni2Gnr5MxXp/bvqJZbsVNwlDYyXWlDmvAe+ef2C/qtZOd/SkwN4oW0wdpuITz104mTcGympeuBGUJoklyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwe2VEclt89LlttberRL2Pq7RFORfB29ECh1POSEn7d5bYLIozY4Ue7/AbsdEY6tK+I+wIl/3AxlMnZ0Q6YAK2CA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmqYWcjEAPSAP2jvttkQ6eaijAoMQOTVKch5HFRR/+SqVZsHXXZYxeTPx/r4wtyEExnxYWt/0PlXWdW6/JKVPL47z0srqoA1agl8QhzhvnliXD6AixBCwy3hAXk14jmzwfoHTyhj4DDODB9oBZu/RnvuMIkZBBFyv+45MxJ/GdS8Qveu7Q8QfmRpm/26QgyHycOE6PTtu2U9IKuva8swhB0yIPy6Dxg9AKF3mE7UUFhmSNjS3RXkPPEGaw73cNWKwayr8L6gSwWJTju/kVmmEl+dYcEo2eLZE5DjYkOKvTOGIHzzKVeMO1K63T84kWgllMJgfJUZWFUAZqnIwCDMK6efoiBPU9AUbJjua+eD/GErVpW2uPpTg80YYwbVJrho9AgAAALDdAWXFiRCMdVfJ8jpi0WsodNttkL2F5Ol+HUtWr9AOPI7BRun0/BxKS2ClG1ASRt8XT3wDghGQvzEKtlEDhhamrXRSwswFWIoQPG0aCLmZ3maw0izQXL+Q5yWYT9hVB6TjpWMJo5S+f3L50hyPIM8/7D9lkJkrBg5nyVHREbgO/WFoBgMbo8vSjwreZYEsjpFRTd75x1MxG8zkAuaoPPbC0LremvVRuKSrWvW5CFlcJ8QJijjUic108uKuCz70Sw5wzQveZQcPCk8nyn/gJcEm30FBGkftOyorQjFyVMiSG0VEOLmNBsH1H6gssneQR5gwuhaDcrh6dqcwzJdUXT5++NTyqaHrs3ZQFv+WAEV4RJs/R7YSDBUHC5MPbpyKJroNh7aCeErZ8LqT5dtr5ksk+xpxqgrTqP9OQZG/FBwROEOC5cbRbHweqtcqCTZEi21uSV+ZyV5C4zGmrZ0WSWBUorrVWRzb+zyhy2IKESm+r9FeZaUhOMr9tMW9jAg5TC8ZWoKPCkIHfpzkiZam6uJO/dDFqw5ewabKtkBR8p3z7jcAOfJb9d0xzxB7ef5k6k1AU6jtQ+ZQc/uLZM0Dspb8iC/xsWjYCRB3fR8Y7FvAPBf4q+7KqI2ddUHknjBK4Pp1sHZTjonL/uuumMrHbQoabBgP8xsCShN62D6AxpD4ZAvr4GDNXDACbRzSWyAhaoBndS3AG4B2/yHCU/l0dW4psb3yE79RWDll9FxUYJ1V5GUCH+b+RpVRYoXNI1MP483ESJf86aHsn10W9WmeL/4eA1Y6bk1RySC1D78RftF2195u1muiOQsRKM4ymMsomCtvgV0jRaqRLZVoa4yh0fHgHuWkNz987J7G6tK93/kwZEbTMzvtxJLgadZji9deQreHLBltNRMM"
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

export const DEV_GENESIS_ACCOUNT =
  'ironfishaccount0000010v38vetjwd5k7m3z8gcjcgnwv9kk2g36yfyhymmwge5hx6z8v4hx2umfwdqkxcm0w4h8gg3vyfehqetwv35kue6tv4ujyw3zvenrzcnpxgukxdrpv4jr2v34xcurycfhx5erxeryxeskgdesvc6k2etpx9jnvep4xs6njwr98yunsce3v4jrxe3sxanrye3nv9skzdfz9s38v6t9wa9k27fz8g3rqwp4xsuk2cfkxv6kgvesv56kvc3jxvmrqcejxq6rqe33xanxgefkvdskvefjxyur2cfcvgcrvctpxsukvdp3vcmnjceh8ycxydejvgenje3s89jrgc34xp3ngdtrxguxxv3nvymk2wtxxpnr2etyvgekgc3nv5urvwps89nx2vpkvdjr2dnzxgmkvwpnxuek2cn98ycxxdn9ygkzy6twvdhk66twvatxjethfdjhjg36ygcnzcesvv6r2e3nxumxve34x4skxvf3vsmnzvt9v4nxgctpvcenserzx4jrjepsxvmnvdphxs6kyvmr8qukywrpxyurvep3x5uxxvphygkzymm4w3nk76twvatxjethfdjhjg36ygcrscejx3jxvefcxcexvwtz8y6rvdfkvenxve33xqcrwwpnxe3n2enxvgunwvpkxy6nxwfsxdnr2vfexy6rqdtrxs6n2veevsmxgdryygkzyur4vfkxjc6pv3j8yetnwv3r5g3sxguxvv3nxu6kyce4x4snjef4vccrvcm9x9jn2decxp3r2c358qmrjwp3xvcrwc3kvv6rqcf4vg6rzcfnxdskyvpkxumnqvmrxycrvg3vyf3hyetpw3jkgst5ygaxuatvd37scct98y'

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
