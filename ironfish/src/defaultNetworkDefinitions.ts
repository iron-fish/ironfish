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
        "data": "base64:zpbXqPyYinahMhMyG5jkiPw9FprYYKhcRw/wwSzPelM="
      },
      "transactionCommitment": {
        "type": "Buffer",
        "data": "base64:GsTuOFdRk2jr1embhTpGOTLRxZZaf3PiSjLKlL5ggcY="
      },
      "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
      "randomness": "0",
      "timestamp": 1670369560299,
      "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
      "noteSize": 3,
      "work": "0",
    },
    "transactions": [
      {
        "type": "Buffer",
        "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiIpiSI9k8eWpysuySMeLMERa2EB4vKNN36oZprU1N3PDSTOLSDaYipJOAlHh212PtupDXaqpPWQO+egkaRhWEXZ79rqPURJmFz8w9d3TjiEmGvyN+NZZKVeJILHLwPSuDRbKmShU8D8rgi8EOpmJxpu6BGh+ikyVkdFwZbTZkKjpbjX6/O1emDsW0Q2kXLullukVEKM8upyrRWkduri9neei5eAAkHd0queF5ST3tvHAyqmAAKkm4pak98+/heoyLfUe/mXOnuxF/KVh9TOO6ru22il6BLNtcYZ+MWbNveprZyfRTspscAtZIEsliqY9LT/9pj7Glo500H0g2vDqKScC5ofykUo73tRlL3japAMnn4BW7DpLGTnqP/cPXtW1KEyhUPKmG+nFIz2bpS++qU5xdDVK25aYVkaowUvRBYp/o3CZAselMlxZSKrS7f+ZJfruvR4fGXoo1z5UF/vKjh0uB1mS6mDy02YWD2VBhiWWj0lJ4TdJBZEe1zHhjnuV24vaPM4BTkBa81DQ/1ba3kDnYf1gqDD54aC6BrSyWcuU9KX+LQNpU4fRdJhL1Wvo7+hK+OJ15/5Jcm9uIEZpc2ggbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMHguHst3G4YXf1Z3cGI+1nrY5rTN/ALJ1OtkmIyGTcTeOmGdJtY644qep+lAKr7Myuu+RiWVBgjA41cwsW8g/Ak="
      },
      {
        "type": "Buffer",
        "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8K+v////8AAAAAjI971QGgaGKsLcajuvHIRo/dbYwCQrcgB1o/YzveVe4bTfV7kJgK3ZRL1YJLef+FoX89q8ie84LMaAbklFTLMYTQthxN/RpCx+tzHGPWKodMcLJEBqjMRagwsvtXnxX3D7K1UbJI6ROsUMnBvmjxMCbXFcRJuYLB/Zy1ZK6FB5iNai1yK+jlOQrou7NctvYKuSKUMkZFVt5t4fvdEktZq1aQk77Lz2mn1XD/ANXlf0nU6MS6Wu8C6cwsdndMYYk3j/dtVkRp6Rwyd6abWLTyRNbLVRGYWloAM1MCDLgfkw3dVcTfxL3i0r0gFjTTPUe0HRSK0aNNtpFIHx46BGrnBF4EYTK/d0jnWBFkdc020Y9N/hy1i2yoIXRSXmxruNik2oA3jXg2B6b3JxsQFJW8Qa03r432SAlTPj69DB/KaWKDfcYvdJXuYhu3tBeswGEW9N01xVbcLt2sPdoh/peGEmIYxax+71bR8eAkkGorH1cb/CFo10hQjd7MOv9DgypE0MLj2y6ttPR/uzLJL5bta+YjVckuUfA0wF0GleN9HFJd0Pu40ishMvqPkV6fkuqjs8q7xKADzFtJcm9uIEZpc2ggbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwML1Xd0mzOEDjoUuqCeJh6X6nM55OT9brdiL/saDdvGCbL1CwAuooVphkQ83/x3LmnTZ3wSRptvZBZxw3y6G2xwY="
      },
      {
        "type": "Buffer",
        "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArUnToPVoSGUxqk5u+mz3N/Z79O91JLTIVl9zWfEx2kUFvmmqxAO6HcwmqKPRsE72sIrHoW5PCnKElOIHRWCj/yPXy5zWx50pzJySWLklimd9iO7/q6Os3Vx2AuVqq+pvA+y6d5Phb0XQWGV6qJzV2k88ksHIGwO9fyln3SkYj3hWBA3n83WXsOsv4UaBAravhgjenDeDgb5X/4zAAXjZtuYO+P9e7PFi/4pM8q0roNl6k268B3meKNhi/TglMbwuPUa74MxfbCzkqtOJ54GXBf72dPus6112EO1EOXsVUzzYZWAPe/i0KWANDRzCpw6kjwM+2/8UI4wuZD35qpZzaTMduij8SI+ogWXBgC5ALMEprxujJpLOw8S7xJUCoFhIAgAAADyLyCiozFM0b2PHAzsLpX2SisoMPsE1vtJmSifQo2xKzSsUhK5YDTiE3YAWhrGyJIRFqu8RtDJIefNhH7vXAatb2Ca+S9pL8lyvi8V191NUWys19bhhgkhO3sQsZSWZCrF87p/K7ftXsrwCeaiOj6muAh2ZPmDKdWEQVp9MrFOmna+1ZvXOSbEMMh0P/PvGc5U67qYHy7y4clSpwSrDybE6TZV+iDkDshGbP+M+kVJ70l6+Ad+1N/60EiWPp9UnORPiIpwYQalZbl6R838pkbLgwQI4q3Dbmk5RK9jfMtttSCTRZhmLJ1O0aiXR7Abln6RaHvOic5EgfcLlJ4AJzn0nysjvbaidF6PXvptfN+TlQvVWQkfVm2ymYk/gi/0KsBIczKudJ7rIk0uJHIdmRiRwnFrZssFKsUYgk/IY0GidstYPOGXKHaU7Ifn+X7qlfM8q8/CbrsT1Hl0Cad9S915s+Vd2jk0aXo63I0wuGtm4rCP1onWJJAIVN4Ve7lRmWsuROQZ/qMqE63P+eA1Qx72xrBHC9oJktAtC8FbBkkonKRq/ramRqwHhXqb3/QuvzvUyJy50ueYoa1C4qEQ8d+5HmocqVb06NZ1suWdeSDyFmqzBC1NWUXajNRW1e/scra6vhO+rmPbT2mWyu0N7leb1lEVgXFEuFhl8AQSoF1/kwUhWq/56QnmZCnNUhPd8FOGCdAYzh69wCDeAOI1lMRhLE8Z4b+D/LPlpX73mcSqyNP/bycMyNP/tGLyL3+hfveTm8GCRHF0isCwQpRe9Ge9dwqWeK+QHmnW1aiPMcp1rKvAHDXsoDCLkJ8xgwdDocPQfawll8rqxHj2/gn49sxLpO/pe/PUKng5uAFELGg45bhxmDKBk3C577aRsK7Z8wfLjaWyq4rAJ"
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
          "data": "base64:zpbXqPyYinahMhMyG5jkiPw9FprYYKhcRw/wwSzPelM="
        },
        "transactionCommitment": {
          "type": "Buffer",
          "data": "base64:GsTuOFdRk2jr1embhTpGOTLRxZZaf3PiSjLKlL5ggcY="
        },
        "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
        "randomness": "0",
        "timestamp": 1670369560299,
        "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
        "noteSize": 3,
        "work": "0",
      },
      "transactions": [
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiIpiSI9k8eWpysuySMeLMERa2EB4vKNN36oZprU1N3PDSTOLSDaYipJOAlHh212PtupDXaqpPWQO+egkaRhWEXZ79rqPURJmFz8w9d3TjiEmGvyN+NZZKVeJILHLwPSuDRbKmShU8D8rgi8EOpmJxpu6BGh+ikyVkdFwZbTZkKjpbjX6/O1emDsW0Q2kXLullukVEKM8upyrRWkduri9neei5eAAkHd0queF5ST3tvHAyqmAAKkm4pak98+/heoyLfUe/mXOnuxF/KVh9TOO6ru22il6BLNtcYZ+MWbNveprZyfRTspscAtZIEsliqY9LT/9pj7Glo500H0g2vDqKScC5ofykUo73tRlL3japAMnn4BW7DpLGTnqP/cPXtW1KEyhUPKmG+nFIz2bpS++qU5xdDVK25aYVkaowUvRBYp/o3CZAselMlxZSKrS7f+ZJfruvR4fGXoo1z5UF/vKjh0uB1mS6mDy02YWD2VBhiWWj0lJ4TdJBZEe1zHhjnuV24vaPM4BTkBa81DQ/1ba3kDnYf1gqDD54aC6BrSyWcuU9KX+LQNpU4fRdJhL1Wvo7+hK+OJ15/5Jcm9uIEZpc2ggbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMHguHst3G4YXf1Z3cGI+1nrY5rTN/ALJ1OtkmIyGTcTeOmGdJtY644qep+lAKr7Myuu+RiWVBgjA41cwsW8g/Ak="
        },
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8K+v////8AAAAAjI971QGgaGKsLcajuvHIRo/dbYwCQrcgB1o/YzveVe4bTfV7kJgK3ZRL1YJLef+FoX89q8ie84LMaAbklFTLMYTQthxN/RpCx+tzHGPWKodMcLJEBqjMRagwsvtXnxX3D7K1UbJI6ROsUMnBvmjxMCbXFcRJuYLB/Zy1ZK6FB5iNai1yK+jlOQrou7NctvYKuSKUMkZFVt5t4fvdEktZq1aQk77Lz2mn1XD/ANXlf0nU6MS6Wu8C6cwsdndMYYk3j/dtVkRp6Rwyd6abWLTyRNbLVRGYWloAM1MCDLgfkw3dVcTfxL3i0r0gFjTTPUe0HRSK0aNNtpFIHx46BGrnBF4EYTK/d0jnWBFkdc020Y9N/hy1i2yoIXRSXmxruNik2oA3jXg2B6b3JxsQFJW8Qa03r432SAlTPj69DB/KaWKDfcYvdJXuYhu3tBeswGEW9N01xVbcLt2sPdoh/peGEmIYxax+71bR8eAkkGorH1cb/CFo10hQjd7MOv9DgypE0MLj2y6ttPR/uzLJL5bta+YjVckuUfA0wF0GleN9HFJd0Pu40ishMvqPkV6fkuqjs8q7xKADzFtJcm9uIEZpc2ggbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwML1Xd0mzOEDjoUuqCeJh6X6nM55OT9brdiL/saDdvGCbL1CwAuooVphkQ83/x3LmnTZ3wSRptvZBZxw3y6G2xwY="
        },
        {
          "type": "Buffer",
          "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArUnToPVoSGUxqk5u+mz3N/Z79O91JLTIVl9zWfEx2kUFvmmqxAO6HcwmqKPRsE72sIrHoW5PCnKElOIHRWCj/yPXy5zWx50pzJySWLklimd9iO7/q6Os3Vx2AuVqq+pvA+y6d5Phb0XQWGV6qJzV2k88ksHIGwO9fyln3SkYj3hWBA3n83WXsOsv4UaBAravhgjenDeDgb5X/4zAAXjZtuYO+P9e7PFi/4pM8q0roNl6k268B3meKNhi/TglMbwuPUa74MxfbCzkqtOJ54GXBf72dPus6112EO1EOXsVUzzYZWAPe/i0KWANDRzCpw6kjwM+2/8UI4wuZD35qpZzaTMduij8SI+ogWXBgC5ALMEprxujJpLOw8S7xJUCoFhIAgAAADyLyCiozFM0b2PHAzsLpX2SisoMPsE1vtJmSifQo2xKzSsUhK5YDTiE3YAWhrGyJIRFqu8RtDJIefNhH7vXAatb2Ca+S9pL8lyvi8V191NUWys19bhhgkhO3sQsZSWZCrF87p/K7ftXsrwCeaiOj6muAh2ZPmDKdWEQVp9MrFOmna+1ZvXOSbEMMh0P/PvGc5U67qYHy7y4clSpwSrDybE6TZV+iDkDshGbP+M+kVJ70l6+Ad+1N/60EiWPp9UnORPiIpwYQalZbl6R838pkbLgwQI4q3Dbmk5RK9jfMtttSCTRZhmLJ1O0aiXR7Abln6RaHvOic5EgfcLlJ4AJzn0nysjvbaidF6PXvptfN+TlQvVWQkfVm2ymYk/gi/0KsBIczKudJ7rIk0uJHIdmRiRwnFrZssFKsUYgk/IY0GidstYPOGXKHaU7Ifn+X7qlfM8q8/CbrsT1Hl0Cad9S915s+Vd2jk0aXo63I0wuGtm4rCP1onWJJAIVN4Ve7lRmWsuROQZ/qMqE63P+eA1Qx72xrBHC9oJktAtC8FbBkkonKRq/ramRqwHhXqb3/QuvzvUyJy50ueYoa1C4qEQ8d+5HmocqVb06NZ1suWdeSDyFmqzBC1NWUXajNRW1e/scra6vhO+rmPbT2mWyu0N7leb1lEVgXFEuFhl8AQSoF1/kwUhWq/56QnmZCnNUhPd8FOGCdAYzh69wCDeAOI1lMRhLE8Z4b+D/LPlpX73mcSqyNP/bycMyNP/tGLyL3+hfveTm8GCRHF0isCwQpRe9Ge9dwqWeK+QHmnW1aiPMcp1rKvAHDXsoDCLkJ8xgwdDocPQfawll8rqxHj2/gn49sxLpO/pe/PUKng5uAFELGg45bhxmDKBk3C577aRsK7Z8wfLjaWyq4rAJ"
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
