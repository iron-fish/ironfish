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
      "data": "base64:add765bXM/+8Y4zMbqy6liQ61mdaekS4OryZDGvVHFg="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:6tzPYa5SCDPg4j2iqEBDMHxVOMgZriuXENImc/jNz28="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1679016111774,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8R6nGttIAsCxegV9XNOEYsRINZgKX/VkYOpEjQaW3dSLCxYMcuN0/H+zLc/H0rxUuwyfIcQpxkXLzyUsUCarNVPYF8X3co+6rl5ZLmYm0FeD6QrZ1/YR/SKAT8rZ5GAywsBh/1tS5oi8NzTHbTmbCQCvtHB5btwfCT1KNJFgF8kXIaIZ9drb3p0Y8gHS57jvvx5ZbtPRRh2nYyI9l9FU7WprEdcNSU3SC1WPo83DFgWxYK4dWfoa9UGYHdC9SGdJDFDWJjyUniT/GsOLW8QmxoAk4xPZg/UqV+1uLBpvghQfbG/BcYGf6MpdzrHyYh+feVKrw+tjBOLriyrNH9DirIAxeaX9DrUU/u+oZ5G5OQscKwzZti/1XUk0SaIjTiRlrxZ2RRV+4ydk4M80NyQL6/BLMWjW0xapRuFQ0Hdo1dcMnygPOm4kGDxRdVG4HO3bg7UA3uZPJpD0yXbJ7WgqOi+LeDsLiRTt+HY69oIIvuLPwiih6alsI4pYTE1b3OitYXDyamSKmWjh0xWZUP0ogcpyUpcQpZN8Owv2uO3O4RbKzEDKG/k0x/2WD0THtPQaaccXGJHr5WlIBHONi8S4LfFs716VR5URtT6ET/JKG4hLdufgjDYybElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwXj2uVmiD6IW2pPSjEUpinDXq7xCAu/D75EG0slsFKNM9SCPfWjWhBBfU7Wiz9E3ioY1itGiAs+Ba+klVZKxXDA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAdzsmqjd3/xsM+xjeEw4BfKqXJJeaBLb5xSrQuRp9ap6txvjt9YLwCrqYUIyn2eax0fdxZ5wsVC07hO/d6xCp5PYMgfOHtgkIOZyAHiKxOOi2631q2fxbK3uYqk3INrmcav8Gvo+cU6o6fvKQF1U+q226tev4DvqAeA6vy9GpTLoAS/kbWzo9iumhcgS8qj8tZVVPzNJ45aZtjHjoMWHfTBXzZc7JhqwU3uwhUIwVebOB5Q9OEccCiB9jp67RhN0mlGCFNJRuFTUGZzWFf2VCx+tVM8vB06wJETDSDjxayebCkcFFspajrhuezsIaDFrsOidDLnbmQPCfT34d/kMv37LXstgk1Yw57iEIVdQL1rm6prr6Qozpi2GaXF7O69Jh+qN0L69icS42M5mPhXYp7t6YqhXkVMt1D5+Sqlat58syvJQ53w0oqVpOKusMViafsOP3fzwZZSqLU+mbf/uU1A7Wnee2UKXJ3uv2LsCDgs+qDxj3lNws9ev25JtmyPlkDibFTIfNGVCw10DH76TiXYPqJjEhu5BuGPzy9DpGFhLva+X5JAYqpzzrrT4AbbVcNs0aDf87yWQtOnLuuH8Q7MLmENfVydLO9yaHp7qH2ylgKzsKllZ7rUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP/iXClaNwMXsJUoNM1pOxSjr6449uqEKNhBAL4bbIyhwtp9xkwRar6wm5G10+2L788yEv+nkV294vtoxJz5KCQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBJ1rRV2+I6nSQl/ap8/mmbIrmCZpkv/oRu8LRjZaT+JKByIQJd+SBFZq8O3zQT77HUx3e6/Rxv11VlqhuwKIhtwI2yXdcEues6GwWPk89WIN7zT5aFsrtnX07+AGu58VoAJJdQJmwtIJ0tVQr1sPp1RgskKPuXMNChkBxHHFN8VstBFPO8cvBotxwRCveuPaFrSRvsTNlTEhDMQeVG+jb+/r9KLrgwLY6qx3bbjHcyy3FbOxwjLOTNpPD4x+zdIbAqWPuSjIDdUIYjUYqLqZRdofRvcFDeYkoi5OBSPnn/QblgQAUVbwKY/xVx2YPNrrcyqHlfy45AvYhaMcNrqy6BqxeHmjUHxBENR4PBQwkm6CjYOvBRIGEU5SlF5DPQ6AgAAAI1XpnKCGDdsct3F5rohVL2AR2jduuYcBhcUGZ5pin6TUwuD9X6VmG70gUGEFe1AkCsbENH0yIUjQeTmjghoobN7aMgiGuRo7kSoh4iXyDvw6br9Hr+CMLoedXqdRGHlBIUQTrucaTCNWMfXgqwUIRs87GLhUN93o5HPq5ks7kYl72/+XCfntTBfsJt3kBGugq2pALDdvHKcZEOTlYwmrExGwfwLe/yicCDaSgZuqMAt/9c0ZK+gOupy0Fz8I0fi+wWgYzGiu4wLBMcKYOC1FeSYX+KjKdirvyQSJgafngAjhxQjL2n6Grqai25eg9YCm6y281XOKBxw3Y/9j5g3G0kw7NeeVlT3L5XnYnb4fAxlW8m8PdOrpQWlmDgt2EyHVojw4fOfuOP0h5kOBaEE+zGOI496eCQ5VrDkXBkJL7UVg/da+NCDopMqlmmdlTBiJrw11/s8Z5WKmjpUfV4ZWw2/bW2f7UjFZMj3fbyAgIcchec4h/1m73Eae8m5yni2N73E+ws/otOCIPx/a9ICNE9/mHkAHgYQCp2F2yC26ood4j65rlZ1ABTwFgdNXxMh3gUfwVxtT5AFGqn2yTxMmHy5VlbBR5iqv5cGotEUWU2xztIz4r4EUGeIYjslijI8zLk/B7tCj+d2Z/YHF6+VxGWJfUdQb+uPL0wTrFqqLlvoozRNGUwuGtlu5BXLNnZSx0sjTMmaillZ/LXL+hWSXJp1nJ9YugyYP2hhJkz/nWtU5OmxrbJ2dtIMwMTCm1l2hIqFMqTdq0Tp7BN5NGybcrCy1i9+M7jgdockeczerWrz68DF3d7Sziow8+vWbVw7Xkd1oqY9ZSADcQrapW7fyeScQbVvFzfhoZ7CkD31iwU3vbeFoe7sm4T/0qptcwTneOPclmgAEEUN"
    }
  ]
}`

const TESTNET_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:add765bXM/+8Y4zMbqy6liQ61mdaekS4OryZDGvVHFg="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:6tzPYa5SCDPg4j2iqEBDMHxVOMgZriuXENImc/jNz28="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1679016111774,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8R6nGttIAsCxegV9XNOEYsRINZgKX/VkYOpEjQaW3dSLCxYMcuN0/H+zLc/H0rxUuwyfIcQpxkXLzyUsUCarNVPYF8X3co+6rl5ZLmYm0FeD6QrZ1/YR/SKAT8rZ5GAywsBh/1tS5oi8NzTHbTmbCQCvtHB5btwfCT1KNJFgF8kXIaIZ9drb3p0Y8gHS57jvvx5ZbtPRRh2nYyI9l9FU7WprEdcNSU3SC1WPo83DFgWxYK4dWfoa9UGYHdC9SGdJDFDWJjyUniT/GsOLW8QmxoAk4xPZg/UqV+1uLBpvghQfbG/BcYGf6MpdzrHyYh+feVKrw+tjBOLriyrNH9DirIAxeaX9DrUU/u+oZ5G5OQscKwzZti/1XUk0SaIjTiRlrxZ2RRV+4ydk4M80NyQL6/BLMWjW0xapRuFQ0Hdo1dcMnygPOm4kGDxRdVG4HO3bg7UA3uZPJpD0yXbJ7WgqOi+LeDsLiRTt+HY69oIIvuLPwiih6alsI4pYTE1b3OitYXDyamSKmWjh0xWZUP0ogcpyUpcQpZN8Owv2uO3O4RbKzEDKG/k0x/2WD0THtPQaaccXGJHr5WlIBHONi8S4LfFs716VR5URtT6ET/JKG4hLdufgjDYybElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwXj2uVmiD6IW2pPSjEUpinDXq7xCAu/D75EG0slsFKNM9SCPfWjWhBBfU7Wiz9E3ioY1itGiAs+Ba+klVZKxXDA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAdzsmqjd3/xsM+xjeEw4BfKqXJJeaBLb5xSrQuRp9ap6txvjt9YLwCrqYUIyn2eax0fdxZ5wsVC07hO/d6xCp5PYMgfOHtgkIOZyAHiKxOOi2631q2fxbK3uYqk3INrmcav8Gvo+cU6o6fvKQF1U+q226tev4DvqAeA6vy9GpTLoAS/kbWzo9iumhcgS8qj8tZVVPzNJ45aZtjHjoMWHfTBXzZc7JhqwU3uwhUIwVebOB5Q9OEccCiB9jp67RhN0mlGCFNJRuFTUGZzWFf2VCx+tVM8vB06wJETDSDjxayebCkcFFspajrhuezsIaDFrsOidDLnbmQPCfT34d/kMv37LXstgk1Yw57iEIVdQL1rm6prr6Qozpi2GaXF7O69Jh+qN0L69icS42M5mPhXYp7t6YqhXkVMt1D5+Sqlat58syvJQ53w0oqVpOKusMViafsOP3fzwZZSqLU+mbf/uU1A7Wnee2UKXJ3uv2LsCDgs+qDxj3lNws9ev25JtmyPlkDibFTIfNGVCw10DH76TiXYPqJjEhu5BuGPzy9DpGFhLva+X5JAYqpzzrrT4AbbVcNs0aDf87yWQtOnLuuH8Q7MLmENfVydLO9yaHp7qH2ylgKzsKllZ7rUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP/iXClaNwMXsJUoNM1pOxSjr6449uqEKNhBAL4bbIyhwtp9xkwRar6wm5G10+2L788yEv+nkV294vtoxJz5KCQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBJ1rRV2+I6nSQl/ap8/mmbIrmCZpkv/oRu8LRjZaT+JKByIQJd+SBFZq8O3zQT77HUx3e6/Rxv11VlqhuwKIhtwI2yXdcEues6GwWPk89WIN7zT5aFsrtnX07+AGu58VoAJJdQJmwtIJ0tVQr1sPp1RgskKPuXMNChkBxHHFN8VstBFPO8cvBotxwRCveuPaFrSRvsTNlTEhDMQeVG+jb+/r9KLrgwLY6qx3bbjHcyy3FbOxwjLOTNpPD4x+zdIbAqWPuSjIDdUIYjUYqLqZRdofRvcFDeYkoi5OBSPnn/QblgQAUVbwKY/xVx2YPNrrcyqHlfy45AvYhaMcNrqy6BqxeHmjUHxBENR4PBQwkm6CjYOvBRIGEU5SlF5DPQ6AgAAAI1XpnKCGDdsct3F5rohVL2AR2jduuYcBhcUGZ5pin6TUwuD9X6VmG70gUGEFe1AkCsbENH0yIUjQeTmjghoobN7aMgiGuRo7kSoh4iXyDvw6br9Hr+CMLoedXqdRGHlBIUQTrucaTCNWMfXgqwUIRs87GLhUN93o5HPq5ks7kYl72/+XCfntTBfsJt3kBGugq2pALDdvHKcZEOTlYwmrExGwfwLe/yicCDaSgZuqMAt/9c0ZK+gOupy0Fz8I0fi+wWgYzGiu4wLBMcKYOC1FeSYX+KjKdirvyQSJgafngAjhxQjL2n6Grqai25eg9YCm6y281XOKBxw3Y/9j5g3G0kw7NeeVlT3L5XnYnb4fAxlW8m8PdOrpQWlmDgt2EyHVojw4fOfuOP0h5kOBaEE+zGOI496eCQ5VrDkXBkJL7UVg/da+NCDopMqlmmdlTBiJrw11/s8Z5WKmjpUfV4ZWw2/bW2f7UjFZMj3fbyAgIcchec4h/1m73Eae8m5yni2N73E+ws/otOCIPx/a9ICNE9/mHkAHgYQCp2F2yC26ood4j65rlZ1ABTwFgdNXxMh3gUfwVxtT5AFGqn2yTxMmHy5VlbBR5iqv5cGotEUWU2xztIz4r4EUGeIYjslijI8zLk/B7tCj+d2Z/YHF6+VxGWJfUdQb+uPL0wTrFqqLlvoozRNGUwuGtlu5BXLNnZSx0sjTMmaillZ/LXL+hWSXJp1nJ9YugyYP2hhJkz/nWtU5OmxrbJ2dtIMwMTCm1l2hIqFMqTdq0Tp7BN5NGybcrCy1i9+M7jgdockeczerWrz68DF3d7Sziow8+vWbVw7Xkd1oqY9ZSADcQrapW7fyeScQbVvFzfhoZ7CkD31iwU3vbeFoe7sm4T/0qptcwTneOPclmgAEEUN"
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
