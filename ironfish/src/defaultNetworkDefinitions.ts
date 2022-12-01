/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function isDefaultNetworkId(networkId: number): boolean {
  return networkId <= 100
}

export const TESTING = `{
  "id": 0,
  "bootstrapNodes": [],
  "genesis": {
    "header": {
      "sequence": 1,
      "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
      "noteCommitment": {
        "type": "Buffer",
        "data": "base64:TMsXFB0X1rSmxcwaSKmeZnuHMtHyJuc+cXWOql5vcQU="
      },
      "transactionCommitment": {
        "type": "Buffer",
        "data": "base64:HoLUNNlhmM/XE5DWoP2MI2m8d1GAtVpMCM16VmAKvPA="
      },
      "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
      "randomness": "0",
      "timestamp": 1669926644716,
      "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
      "noteSize": 3,
      "work": "0",
      "nullifierSize": 1
    },
    "transactions": [
      {
        "type": "Buffer",
        "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACXomQKROf9+ygSObkQLddHlG/iPHoqHMybeYiPJtMVNoY6lzwBFG/XU728TQ09Lpqn+2s6ra/gg9NyzdHlxUiYV076SrpL7vnO/++7FDpajbCXHfQyG9OXMujrO5JHhFoRhRssGauEv4QwRw3blSXFShQ8MrXrRf3v41IJ6lkehxVgUgDRD55QpZh9imVYcGOMqP9Y9rR0FNpYRvaiBgUh0TiuJ1Mq1r2lNUWZ54HR3YuDBvcscps4aj1bdN48p4+a95/A8RqN6GCP6WbmRcQGWleWSHj6XP1rWx6dy8UXVPWZKOjWSsjwArVwK2Vpfgx77W0igU+BHcWVF4OKOjdKv0gnoAW71rVvI721C+RB1ouKe6ClrYNimHpovAa8prsPzLc/8LZxKWoHSn7CerM+BqHOYDDTWpHMFGXTxIv/Ho521F3rmDzTqMyjn6tyhPUhkiJ4Vs1sOQX1s4l7wPgDLJPe6eBSJJ5E5ouqqLCPERayNTutQtNnGnA8903pG6ElqFByA2kcAfMaepeAxQlJrab99J25ScpCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMIDfx+pvS8/eFTz3N/3oqCQl+7t0Gv9seejao+cujIrdFfp5uT80IVvNcGOa3eTTAp/RoDMpWqBQzfLIDf648gQ="
      },
      {
        "type": "Buffer",
        "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgPFLHxTx/wAAAAC2d/sQGvPOsVPp+ZZHTUFfYIcp0Ordo6RTnyammytvUNJjHWt1H89oTp8/pukYl4yAxHtiWQwk3GN+KusFcP6KjPyp8npIK36F7kbT9Y/VA1r16g+GugEmB9Pt2b7WyxAVOyFKuQgDQlpICokm8FlfcmUsYjoE/QsdxGZLsPpAVXiNIxTfRhzme3B0JkJqE4aPPzn5Dqdw3EPG3ejJhpLuokZjwuC4TFWGfLQbRG1XgTu3OgDJwV+boonsGNRX772W0tdLRR7NGArnNzyMj1vKOKWgQIG4d8L8lXSu1y6XataKPrguaXyNoYIcDbWVJFAuy92gKIHU2ak0Fl5nBiRR82m10I4dwSheD07UwMo+6r4PHAbLKuGXgLfaVgTkkRQJICjknyaoQhlHqeWjo2MrCiHCtOh8v/goDEja1GV0sINhwHBNnZmDKknI8XdwWMnsB1mkjefcrF/9h/EjleELuHE2/zKFz0T5dEgZ/A/WODnC/fpnhliwSuPJ3YMWsEggDXd5+d0K3lHpWz1Bz5uisRy221PpGQ5CZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMBVA+3gh+gwvy3gehtwXYI/wxQSoij8sDSZfJFlCFEYArgzaFvtWlNMKlOLBc9F1P+RKzqrJ89Wjr68vv9fFwAc="
      },
      {
        "type": "Buffer",
        "data": "base64:AQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC1eeU/6NyNn05LduXkdTOAXlmToG5BTV+nBcWighwojzoagbzYUCrs61U5RvNU3Syw0/s+UVeJQvqiFITbGqsSS4rwEqJ8bSgOiHeqoJOwJnb7UGY0qCBAGI88lf/hEPkE9Mn2j92D22bim0SkkwJDrFbp4fd58m9qmdpWl7uWi1nJOfKGMr5lYAV3If3+FZuL0dTeMkRTggOH4/LiEs1ZZeoB9SST53Jyj4dzJhpui1c6smo7rL17YPkqdm4856OfNesRrpNXdl0GWfBAxPDtO4yRue3mB9iUx3o30Ez8ZIw+brVB/3chfeuRj24MN4Im3OA+vb+evsKHA1XPtCTPy3hwzvMkEKgZg+bkjDIZET4Du0HTrppA4WD+SdUbOQICAAAAFJw/4LKpsPHce++A/1zcrRFid16t5KMU8jUZ9cIPbV9s7onlLlw3O204HBnYt4j9F09pByeMxw47O3vBjEBa0HcF5bLDJCmGf/2HgApF7tvLEUhr75PYT+WsoRHrOpoDtdWV0EtWpoZOpELXOT7/Cezpr2R20f9uEAVxKFnIvBL2r+6d8f+fhl/S74oo4sG6mEPjyB0kZb2tYi/awocjfhj3p8osn9i7Lh+SrMLlDAsvzS6/hrHuvexQ5P6DkKlvBOU2NW8gSkT05SLTCoEs/assVpJoqAdTItJbbx7g3mcANLO9CXQAqRUeVsYUHpgtkRBL4WBZ7FmGhzmhm56898/rZdniJPkj31HnW7SV8fC6TUPOj6yrJ8LD0g+KbdOY+nIdXrpfDxH7RODRfq/zF2UKhhpypUebDHvnaQP3w2iAC80WbmAGeYK7sWTxoF6LVKaKUrl842hqG3k2n6iQNXY7ehtMtS10N1VdV9kr2gCKgvEkmeGiV473L33/1WK+NJfYXlE/skCbcedtxDDDEhdwckuVDIZnE13CW5Adiy8RFM2gf4euev5s1x+HdelfeC49UlqXxuuTCyh0MK0fASRhJ+tez9qwm2if8Z9l8qUDA6X/+m7pRfdXVnYpFtaRjKs8EhERZ9DlUZ+WhSZjjmCGDN6ElHdlnDpXD7PURcVm8PFpDAvpzUXRBw5mNI4NJsc6MFQDbx7vlTCaqCzT1xbHFV2I/dAIj1vbkjkje0eRR9R+u8f50WabDJJfG3YGcSEoXRXDpyelFTmI57rNXYDggKNr/9Mun2NZ8mIhIfxC30DEuvSvxHQVubDuldGKsTtCqvMXDIVy6l2C3EbylNbvUnMwDZgE"
      }
    ]
  },
  "consensus": {
      "allowedBlockFutureSeconds": 15,
      "genesisSupplyInIron": 42000000,
      "targetBlockTimeInSeconds": 60,
      "maxSyncedAgeBlocks": 60,
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
        "maxSyncedAgeBlocks": 60,
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 2000000
    }
}
 `

export const TESTNET_PHASE_2 = `
 {
    "id": 2,
    "bootstrapNodes": [
        "test.bn1.ironfish.network"
    ],
    "genesis": {
      "header": {
        "sequence": 1,
        "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
        "noteCommitment": {
          "type": "Buffer",
          "data": "base64:TMsXFB0X1rSmxcwaSKmeZnuHMtHyJuc+cXWOql5vcQU="
        },
        "transactionCommitment": {
          "type": "Buffer",
          "data": "base64:HoLUNNlhmM/XE5DWoP2MI2m8d1GAtVpMCM16VmAKvPA="
        },
        "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
        "randomness": "0",
        "timestamp": 1669926644716,
        "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
        "noteSize": 3,
        "work": "0",
        "nullifierSize": 1
      },
      "transactions": [
        {
          "type": "Buffer",
          "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACXomQKROf9+ygSObkQLddHlG/iPHoqHMybeYiPJtMVNoY6lzwBFG/XU728TQ09Lpqn+2s6ra/gg9NyzdHlxUiYV076SrpL7vnO/++7FDpajbCXHfQyG9OXMujrO5JHhFoRhRssGauEv4QwRw3blSXFShQ8MrXrRf3v41IJ6lkehxVgUgDRD55QpZh9imVYcGOMqP9Y9rR0FNpYRvaiBgUh0TiuJ1Mq1r2lNUWZ54HR3YuDBvcscps4aj1bdN48p4+a95/A8RqN6GCP6WbmRcQGWleWSHj6XP1rWx6dy8UXVPWZKOjWSsjwArVwK2Vpfgx77W0igU+BHcWVF4OKOjdKv0gnoAW71rVvI721C+RB1ouKe6ClrYNimHpovAa8prsPzLc/8LZxKWoHSn7CerM+BqHOYDDTWpHMFGXTxIv/Ho521F3rmDzTqMyjn6tyhPUhkiJ4Vs1sOQX1s4l7wPgDLJPe6eBSJJ5E5ouqqLCPERayNTutQtNnGnA8903pG6ElqFByA2kcAfMaepeAxQlJrab99J25ScpCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMIDfx+pvS8/eFTz3N/3oqCQl+7t0Gv9seejao+cujIrdFfp5uT80IVvNcGOa3eTTAp/RoDMpWqBQzfLIDf648gQ="
        },
        {
          "type": "Buffer",
          "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgPFLHxTx/wAAAAC2d/sQGvPOsVPp+ZZHTUFfYIcp0Ordo6RTnyammytvUNJjHWt1H89oTp8/pukYl4yAxHtiWQwk3GN+KusFcP6KjPyp8npIK36F7kbT9Y/VA1r16g+GugEmB9Pt2b7WyxAVOyFKuQgDQlpICokm8FlfcmUsYjoE/QsdxGZLsPpAVXiNIxTfRhzme3B0JkJqE4aPPzn5Dqdw3EPG3ejJhpLuokZjwuC4TFWGfLQbRG1XgTu3OgDJwV+boonsGNRX772W0tdLRR7NGArnNzyMj1vKOKWgQIG4d8L8lXSu1y6XataKPrguaXyNoYIcDbWVJFAuy92gKIHU2ak0Fl5nBiRR82m10I4dwSheD07UwMo+6r4PHAbLKuGXgLfaVgTkkRQJICjknyaoQhlHqeWjo2MrCiHCtOh8v/goDEja1GV0sINhwHBNnZmDKknI8XdwWMnsB1mkjefcrF/9h/EjleELuHE2/zKFz0T5dEgZ/A/WODnC/fpnhliwSuPJ3YMWsEggDXd5+d0K3lHpWz1Bz5uisRy221PpGQ5CZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMBVA+3gh+gwvy3gehtwXYI/wxQSoij8sDSZfJFlCFEYArgzaFvtWlNMKlOLBc9F1P+RKzqrJ89Wjr68vv9fFwAc="
        },
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC1eeU/6NyNn05LduXkdTOAXlmToG5BTV+nBcWighwojzoagbzYUCrs61U5RvNU3Syw0/s+UVeJQvqiFITbGqsSS4rwEqJ8bSgOiHeqoJOwJnb7UGY0qCBAGI88lf/hEPkE9Mn2j92D22bim0SkkwJDrFbp4fd58m9qmdpWl7uWi1nJOfKGMr5lYAV3If3+FZuL0dTeMkRTggOH4/LiEs1ZZeoB9SST53Jyj4dzJhpui1c6smo7rL17YPkqdm4856OfNesRrpNXdl0GWfBAxPDtO4yRue3mB9iUx3o30Ez8ZIw+brVB/3chfeuRj24MN4Im3OA+vb+evsKHA1XPtCTPy3hwzvMkEKgZg+bkjDIZET4Du0HTrppA4WD+SdUbOQICAAAAFJw/4LKpsPHce++A/1zcrRFid16t5KMU8jUZ9cIPbV9s7onlLlw3O204HBnYt4j9F09pByeMxw47O3vBjEBa0HcF5bLDJCmGf/2HgApF7tvLEUhr75PYT+WsoRHrOpoDtdWV0EtWpoZOpELXOT7/Cezpr2R20f9uEAVxKFnIvBL2r+6d8f+fhl/S74oo4sG6mEPjyB0kZb2tYi/awocjfhj3p8osn9i7Lh+SrMLlDAsvzS6/hrHuvexQ5P6DkKlvBOU2NW8gSkT05SLTCoEs/assVpJoqAdTItJbbx7g3mcANLO9CXQAqRUeVsYUHpgtkRBL4WBZ7FmGhzmhm56898/rZdniJPkj31HnW7SV8fC6TUPOj6yrJ8LD0g+KbdOY+nIdXrpfDxH7RODRfq/zF2UKhhpypUebDHvnaQP3w2iAC80WbmAGeYK7sWTxoF6LVKaKUrl842hqG3k2n6iQNXY7ehtMtS10N1VdV9kr2gCKgvEkmeGiV473L33/1WK+NJfYXlE/skCbcedtxDDDEhdwckuVDIZnE13CW5Adiy8RFM2gf4euev5s1x+HdelfeC49UlqXxuuTCyh0MK0fASRhJ+tez9qwm2if8Z9l8qUDA6X/+m7pRfdXVnYpFtaRjKs8EhERZ9DlUZ+WhSZjjmCGDN6ElHdlnDpXD7PURcVm8PFpDAvpzUXRBw5mNI4NJsc6MFQDbx7vlTCaqCzT1xbHFV2I/dAIj1vbkjkje0eRR9R+u8f50WabDJJfG3YGcSEoXRXDpyelFTmI57rNXYDggKNr/9Mun2NZ8mIhIfxC30DEuvSvxHQVubDuldGKsTtCqvMXDIVy6l2C3EbylNbvUnMwDZgE"
        }
      ]
    },
    "consensus": {
        "allowedBlockFutureSeconds": 15,
        "genesisSupplyInIron": 42000000,
        "targetBlockTimeInSeconds": 60,
        "maxSyncedAgeBlocks": 60,
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 2000000
    }
}
 `

export const DEV = `
{
    "id": 3,
    "bootstrapNodes": [],
    "genesis": {
      "header": {
        "sequence": 1,
        "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
        "noteCommitment": {
          "type": "Buffer",
          "data": "base64:WeH/hWUL0/8EwRFHN+TMi1IZ6GfdHVI6Y5yd5Hl5GA0="
        },
        "transactionCommitment": {
          "type": "Buffer",
          "data": "base64:ROrv7b3M5aMlgprobs2cxUtnowaaqUnUh8V6AuS2ZOE="
        },
        "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
        "randomness": "0",
        "timestamp": 1669840997430,
        "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
        "noteSize": 3,
        "work": "0",
        "nullifierSize": 1
      },
      "transactions": [
        {
          "type": "Buffer",
          "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACTFyXap7mAmBOcwHQjo5NtDG0ewSzCRJ6kj41uzn2AQCD6PxPCuEHIY4Mbf3BWBwGYn7TqCfRmGaZMm+pTv7sS6JrQ1F7c42C3A6QEEA+j9tTfmgq+jjaxINU9+hEMG7kLK3/wd5mYff5IAuBgiFwdHPkhyxBr0SDmHI0QNmBI5D39Q3tUc6wRkjR+uNfubd+qKxWwkFldwvEjuMEzJbTKbCy5JEXuwtgbgHUSfBhy4C74iQkw4irVQ0YECW63PLAjaXgUdWt1vT4vs+7KCkgDHsgr9otmNkuRzxq2pqgeW0UcuVNhmk2ZtjxfB4vHPuiFkMpIgOrPEBcZLUL2Sd1zeZZkk5TMS6GXDETwjCHuOpYbUBepr/DbRBR4S6hHowIxyeeRL6vSW63H6LbFcelX4FRMrVMkcIHQ1qP6oBZJKTrr4i0ixK/0fF73rKXX/3k0VQ1gvwpynRBBnCk1AGoDVhRr8YPCt2dTjZ/Zl8zCX92+JGKXxegFeR6RPItpmRHyj5DkGEA1F7vlLOC4KSya8+ebpCPYw7hCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwME4kzyzgr0srDDNy9rI8qu8ey3zY3bRXCtbTGNbvmImHAPhLVg2A21Bw4R0n+72nFi3EZJl7SaDIx+pb6xss8Qw="
        },
        {
          "type": "Buffer",
          "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgPFLHxTx/wAAAAC1PBrIVtrmxWx4RTQrv6Ch8WKSPI36+uDzn3Njypf3+LR8Ral+kDvolChDhjEVhve4b5e6jd9pv1fdDOLWATshHyzsO+togUym3B10JCs2BhBCZ+Q9IoGwSiz9vRKPOyAPuQuAyDxHeU8Sw3YTZceAv263OQ8P2O7j/Ai6jGsc3FfnEouEQ4xP2ULgu5NmhpiGThUKw6tJV3rVTnXvw2IxJZLS0bJNPFIWVIcQ7Pj1wGiESLSWsRP1GBZ8rlbphdcaO415GhIPexSQ9tjfIQtk+p1y5ZlRgygmfVNicB7JPR2Q7SFEyQcpfwFQ5JuxgWIShWO8qavI5dJfRro/ZzQr1ti9gYZMcpiwv8EfhF7Zx5MxyMQt2cqe3UYTA0HVkUjvH30gjgw2EEBLKhrt/rb6AIWLEnqkWZ3nwwQaaSoChwI3In9JK8qCwqfhjXx1et/keLwTCydZ1flU9kOkbgd8yegjNreQ3mVTctsGwhPDULXM9bYOnQOOSkYSc1wkkRshGiIFl+SWiWdrGBRLxpRwjkHRd22tNCFCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMC2asaUvvmZraO4DjZT0mfXg9tWULXMtJ0Niz9TliydeKjJhDMoj0011lpl3HfZ77NcUhOO83QXPSHQLYWQ86wA="
        },
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACjBMBBitzCt0qXbutpAGTKUMFQWk0voG70nbzaMFSrQmdXOJmByA6tEtIDr7vR4DqB4+nv3UqjiMaIl9yXkxI+loQW1IGmWllWaXOfkp+7SLWLQF2hs6hPbK8uRAagfdMVtufxd9sgHgzyjt1uo4ok0jrnq3EpOJYVxmayuCBCDs+9pgJXsxUZ2+AD4oTVmEyPo1Q0Q5IUoLj3EwNSDitfl4OXLPJxGJEs4bgEJ5TrpMbuDnfmr3i2IYgLaGILuD3dHh11RaEaFgXGABk11GQaX8c/FU46HwX85k6tDcqmIWV5WclAnOLwGfeKdRHuKb7Rb2S0VM1fq387th8EIOQcrfDPwHubzaYar0HMAVaEdusI5ps9+kKrKVIyscu7PHICAAAA6tZCQjeFOO8VkvJwjrW9dAua33y73rZdBo5x2mzqbK+oivAYADu7+tMoCScX8xd3hsSf6+8R6Caj8uepf5TRZzFwjSNSWPe5WT3HzKyjhFHPk1EgJzGaE4vAe0/nPoIHt+iNYVkHcTMranyiwNbpgdmE+C+5YUaD4VbkUPplUI1A0yuOZ21t4Qv0uJwMX55/rhjoabmBsqLH87lRciy64m7guyWPEqkiOnRp2iubu6KnfxePEctzus8AoYbbT8k/CfRfTwwqRL2C1c6zFSRGiCy5vxBdX4SQwzMhsbdXQ4Cz/PaXTewyHeJoEJ4BlK/5rG7PCkE9Z5GjrTG76tp+S9WSAGpMMRRIbAqOwSc0kEEx/vOSDp0r4Cpu6nPoX23FVpM5KRQV0beO8oHQKZ27tOlOIrUz1ucNfVx5AzjjFAa4m5u7acN4jY6Qb9NPeN9VFNd/Z808V9aJSn4R3SJULl8kuoxYnHG+g7MljVQVtb+ruIE26faBZaHgX86MTrIiP484FnysHZLUHTKVyh0KTE65DogaHf0pCfl/sM2b6A58v01tcTXN1VZLFiqiO8tdBSanX+WqCHPjpFMdZr/pU3YEgi9D5tHy0GuyLtk0IfdABjDzmWZf2QzS+f1wrjmHnhQYnIYO5+u/Mzj3l9aQUaxM+uFOQFzsmwUO0VPPfKQETtDQcxNA6yY/R3EBThuEkWgOjfcvJwu6lepk/gufcGZoOoXjDcCMeJoUpgF8gE+Auq9lmcBKFrVKZNF3heNTcI9pQfBidVh8LxxSBZmimVg0w3MZbVjIxzttPhl6gyNjqEwGFGJ5C/nrGBtWf6vOS2j6rttxBG6nkpPhPTw4kd8l8VTOtVYG"
        }
      ]
    },
    "consensus": {
        "allowedBlockFutureSeconds": 15,
        "genesisSupplyInIron": 42000000,
        "targetBlockTimeInSeconds": 60,
        "maxSyncedAgeBlocks": 60,
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 2000000
    }
}
 `
