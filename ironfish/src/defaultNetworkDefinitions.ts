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
        "data": "base64:PxE8W0xhJ5gshf9vCK4q8dsVj5lhuL0wER58ofyBykI="
      },
      "transactionCommitment": {
        "type": "Buffer",
        "data": "base64:jHYNyPGzlMIrDkA2h2VbYI6CnsZgYyo1RYwa3FmZLFE="
      },
      "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
      "randomness": "0",
      "timestamp": 1670355908533,
      "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
      "noteSize": 3,
      "work": "0",
      "nullifierSize": 1
    },
    "transactions": [
      {
        "type": "Buffer",
        "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmFo7XA5OyqjhA7lREtKPvweRarS6iPsEbpxWcvCTDBGe+TeagIsps923nK0M7YtgtVKanDoMIGyW+2hMumTvf88Va5LoakWwODX0TEWB+zzVS82dlVMAqGtFuyB87gt2EVqd3rayTXFJW/zSkOJqXIYlgZv/+lmowOwnb1HL1CF4c7tHtlDnvlv7MEIyu/fZp+Jx1Av5zBeZN5xZXjK/87VicVSrdQKNBrq64anjhubC5eJD92czNYzEOAO9Rhhzc8FE7w8ZB8e4Aq1FJw/izYzhgM6utzOX31+X94nBReGTvsWrAiTI/PBfxGLqAlmEshwrzj/b5fXEiOMSUGlpAOfSonL3TXCHeEeWwEsVyr9EhF3iwZU/LtMHnh8XauMcOzt4CMqnyplcrJcaS+dDDZWvdmUcqtRAYn2VUI0Waa12gG8hqAErSVwK8xgvv1fJevWdJBjo8pqT+NJJGuSFOYfeV5MaBpPJgcOy3SeHsKJdYkf4k/TWiqQtVK7dgPoJ6gZ7HOewSM/yr8DIi1DEDgq7qETjfNiGSXJvbiBGaXNoIG5vdGUgZW5jcnlwdGlvbiBtaW5lciBrZXkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAJmh9+0blIYNxPGy8ujWEoSxOOk7fzpHWqckLltWWopb+Qm0DRCpfGME2ibrtNf0DwxKVjrmq7M7ENAonZ3v0H"
      },
      {
        "type": "Buffer",
        "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAlCDVqSZusx7XqiIKa+zGVoHpV893/SjaSXEecZGPcLOioxvjrIiQmPl/CIaT+pTWtDGZMCcWclkjjL0MNuX+zW/u3WzyTPwiJQd6nPZ8S5fQQfSOPcGE/Z7haf+dYFrdEqunFSLngQRfMhqTFKIGtW9wQ+zTRTgJTh0ZV7VXWLMmRzpIpr3PKG5JBycu7lymoTrsNo9mXTioJQyr34ao/bkCH1dNO9m9s697IF3h1Kt5N8T71jR6envjkZHaizk5ZAqVfIG9K+UxYjzPWWgNdirax/7vZ5eosTQ/X7+LnjzuCcJBuWCpyvfdKvsna4m3Z8ih1Y7tLybfIj5+UjkpY+ZXAXvBxUGFOTsvH34Q596aCo+AmvdoF+D8Sei+HEWPU3U1Z0octtAv/4mSfulsy/5y2RHuf4sXXg+3l3CQPi/4Bga/CDXTlhvzK/h3yBQ0sgK5EOIi9Rvxp1uZ3NEPvtwbytAkHYdmZiVkUVVnqQCKzrTt8YVwF5C8l0nRd8FpANs+8wmCwJcX1V5mieu/P3Zc6P3j+lWYSXJvbiBGaXNoIG5vdGUgZW5jcnlwdGlvbiBtaW5lciBrZXkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAUHV5wX0mweRsNnusTemqdEQSKi2Gy0lxHb7QS+Htu4yL1/WuOBNPViIEUWoOjEODJs7ZeKMLF9DNv6tkj9KoC"
      },
      {
        "type": "Buffer",
        "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAij02yRupiOf72UH+PMksJ+PKK26Oy1etEBtVxnNHY9aWqz+MrUbIcXBri9oU9MYfjGhFPzVjSp6TQeXnz8Ee2ApNd5owKicKoiE+27DH1RiD73MOdai+cpCaU78VuozHBjdm8ApofmrNuLIAsoABmySCMPy04h40hOOiqbEPFuSFgGjLRJPOSgnaLyThGUNFqAc8WnX/gXF5lcS8gD59m47giIJImsbyE73vUc9443Z2s6ugih5/L1l6qKRqhijmVmoTjz1LWLin7ti9EcOaWPm3xl6DVZjaiqaHA3FMG1dHvhslYMxB7UBPOsY6JMVD5S9pAnKtItlf7t6TS2TICiuKhY6n0wE5d4O582OPKgFy1c8F9PhDXIZmAVscVYARAgAAAC2NxqBDNU+wa3UMHEAVOsyubD1SC4bgRra1RpWBuO+80msvtlbQGCikbtqbS7Vz418V5UnYJ7pUoHldPgPFBfE87fzFuKwF7neA2um04/a5SF8ZpLfuLOyOnyTLRT48CYNAkRV1KcxjdH37qV5aQlhiiruH+aCDGD8fpHftnIP+e3nq3wd09+73B+9HpAJvV5i+k31gVh6GylKODeaKWXwTvqiFXZGBiONg7VbFtRhyek6xB+Au80P3y3y5OcyYohWMhsh5wZLPjBmjktjzfAtVPV8uJ6346VFxdtchdffRuBSp0S61ntqJjQAB+l2zt6P0vvMCXZDItWXv+qH3zRaA/jdtEK6Hzvao2/ww9L4XI/zOTj5iYvG6BwcUZTCKWez0oI20qP6BRYiPblBISljegrA8P287AnrLuafFKZBeQUpU6fZi3MmRA2JxqsJJuvoKwRfT+EPrCQXXvVgZQj10M1xeARdZ0ny2Q4YejtVc3j73iM5RMmpUYYEdP+PwjMv5VyDuZDvaB5+d+yZlSj+BH0MualOGCPySs+7KlG8P+YMX0D/orksmUcp55mIq18WipQV9Ke1o5qZSCcZktX/P3PtJWPnFkH9XtL+lYrkNWndhrBubdewPk+B5JAq3h58j4DyW6ZBUrwUrjA+alIf/Kx5t3c0omJnsYkD4HFMxa9qgxcbLznH+HhkZ5UZnyGAUNeyXnCkApiNuHNWQDyJP7M3UxELEd1s9M5IiRXU5SjLn4KEXUFcSFFT9Ihm/u5Qr23oFCTyj7HzOUtuNfDidnb9BR5eWrq6kSa0Gim3mtYg5JEbulV2rOsB2EiN4qq9Jki0yP9ITunEjO4Of4TdLl/fanXs6CA=="
      }
    ]
  },
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
    "genesis": {
      "header": {
        "sequence": 1,
        "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
        "noteCommitment": {
          "type": "Buffer",
          "data": "base64:PxE8W0xhJ5gshf9vCK4q8dsVj5lhuL0wER58ofyBykI="
        },
        "transactionCommitment": {
          "type": "Buffer",
          "data": "base64:jHYNyPGzlMIrDkA2h2VbYI6CnsZgYyo1RYwa3FmZLFE="
        },
        "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
        "randomness": "0",
        "timestamp": 1670355908533,
        "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
        "noteSize": 3,
        "work": "0",
        "nullifierSize": 1
      },
      "transactions": [
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmFo7XA5OyqjhA7lREtKPvweRarS6iPsEbpxWcvCTDBGe+TeagIsps923nK0M7YtgtVKanDoMIGyW+2hMumTvf88Va5LoakWwODX0TEWB+zzVS82dlVMAqGtFuyB87gt2EVqd3rayTXFJW/zSkOJqXIYlgZv/+lmowOwnb1HL1CF4c7tHtlDnvlv7MEIyu/fZp+Jx1Av5zBeZN5xZXjK/87VicVSrdQKNBrq64anjhubC5eJD92czNYzEOAO9Rhhzc8FE7w8ZB8e4Aq1FJw/izYzhgM6utzOX31+X94nBReGTvsWrAiTI/PBfxGLqAlmEshwrzj/b5fXEiOMSUGlpAOfSonL3TXCHeEeWwEsVyr9EhF3iwZU/LtMHnh8XauMcOzt4CMqnyplcrJcaS+dDDZWvdmUcqtRAYn2VUI0Waa12gG8hqAErSVwK8xgvv1fJevWdJBjo8pqT+NJJGuSFOYfeV5MaBpPJgcOy3SeHsKJdYkf4k/TWiqQtVK7dgPoJ6gZ7HOewSM/yr8DIi1DEDgq7qETjfNiGSXJvbiBGaXNoIG5vdGUgZW5jcnlwdGlvbiBtaW5lciBrZXkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAJmh9+0blIYNxPGy8ujWEoSxOOk7fzpHWqckLltWWopb+Qm0DRCpfGME2ibrtNf0DwxKVjrmq7M7ENAonZ3v0H"
        },
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAlCDVqSZusx7XqiIKa+zGVoHpV893/SjaSXEecZGPcLOioxvjrIiQmPl/CIaT+pTWtDGZMCcWclkjjL0MNuX+zW/u3WzyTPwiJQd6nPZ8S5fQQfSOPcGE/Z7haf+dYFrdEqunFSLngQRfMhqTFKIGtW9wQ+zTRTgJTh0ZV7VXWLMmRzpIpr3PKG5JBycu7lymoTrsNo9mXTioJQyr34ao/bkCH1dNO9m9s697IF3h1Kt5N8T71jR6envjkZHaizk5ZAqVfIG9K+UxYjzPWWgNdirax/7vZ5eosTQ/X7+LnjzuCcJBuWCpyvfdKvsna4m3Z8ih1Y7tLybfIj5+UjkpY+ZXAXvBxUGFOTsvH34Q596aCo+AmvdoF+D8Sei+HEWPU3U1Z0octtAv/4mSfulsy/5y2RHuf4sXXg+3l3CQPi/4Bga/CDXTlhvzK/h3yBQ0sgK5EOIi9Rvxp1uZ3NEPvtwbytAkHYdmZiVkUVVnqQCKzrTt8YVwF5C8l0nRd8FpANs+8wmCwJcX1V5mieu/P3Zc6P3j+lWYSXJvbiBGaXNoIG5vdGUgZW5jcnlwdGlvbiBtaW5lciBrZXkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAUHV5wX0mweRsNnusTemqdEQSKi2Gy0lxHb7QS+Htu4yL1/WuOBNPViIEUWoOjEODJs7ZeKMLF9DNv6tkj9KoC"
        },
        {
          "type": "Buffer",
          "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAij02yRupiOf72UH+PMksJ+PKK26Oy1etEBtVxnNHY9aWqz+MrUbIcXBri9oU9MYfjGhFPzVjSp6TQeXnz8Ee2ApNd5owKicKoiE+27DH1RiD73MOdai+cpCaU78VuozHBjdm8ApofmrNuLIAsoABmySCMPy04h40hOOiqbEPFuSFgGjLRJPOSgnaLyThGUNFqAc8WnX/gXF5lcS8gD59m47giIJImsbyE73vUc9443Z2s6ugih5/L1l6qKRqhijmVmoTjz1LWLin7ti9EcOaWPm3xl6DVZjaiqaHA3FMG1dHvhslYMxB7UBPOsY6JMVD5S9pAnKtItlf7t6TS2TICiuKhY6n0wE5d4O582OPKgFy1c8F9PhDXIZmAVscVYARAgAAAC2NxqBDNU+wa3UMHEAVOsyubD1SC4bgRra1RpWBuO+80msvtlbQGCikbtqbS7Vz418V5UnYJ7pUoHldPgPFBfE87fzFuKwF7neA2um04/a5SF8ZpLfuLOyOnyTLRT48CYNAkRV1KcxjdH37qV5aQlhiiruH+aCDGD8fpHftnIP+e3nq3wd09+73B+9HpAJvV5i+k31gVh6GylKODeaKWXwTvqiFXZGBiONg7VbFtRhyek6xB+Au80P3y3y5OcyYohWMhsh5wZLPjBmjktjzfAtVPV8uJ6346VFxdtchdffRuBSp0S61ntqJjQAB+l2zt6P0vvMCXZDItWXv+qH3zRaA/jdtEK6Hzvao2/ww9L4XI/zOTj5iYvG6BwcUZTCKWez0oI20qP6BRYiPblBISljegrA8P287AnrLuafFKZBeQUpU6fZi3MmRA2JxqsJJuvoKwRfT+EPrCQXXvVgZQj10M1xeARdZ0ny2Q4YejtVc3j73iM5RMmpUYYEdP+PwjMv5VyDuZDvaB5+d+yZlSj+BH0MualOGCPySs+7KlG8P+YMX0D/orksmUcp55mIq18WipQV9Ke1o5qZSCcZktX/P3PtJWPnFkH9XtL+lYrkNWndhrBubdewPk+B5JAq3h58j4DyW6ZBUrwUrjA+alIf/Kx5t3c0omJnsYkD4HFMxa9qgxcbLznH+HhkZ5UZnyGAUNeyXnCkApiNuHNWQDyJP7M3UxELEd1s9M5IiRXU5SjLn4KEXUFcSFFT9Ihm/u5Qr23oFCTyj7HzOUtuNfDidnb9BR5eWrq6kSa0Gim3mtYg5JEbulV2rOsB2EiN4qq9Jki0yP9ITunEjO4Of4TdLl/fanXs6CA=="
        }
      ]
    },
    "consensus": {
        "allowedBlockFutureSeconds": 15,
        "genesisSupplyInIron": 42000000,
        "targetBlockTimeInSeconds": 60,
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 2000000
    }
}`
