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
      "data": "base64:bw51Fr1BYA6DkPmRYLGQzvshLC0JycUFGmRRZieozjc="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:0scpd/yTaasH67JXxlelrySlkIgY5nSseIp2hTF2Vgo="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1671060680382,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0",
    "nullifierSize": 1
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjSdCHi713abocxa69Mjhu18IbYnGkmzziMnSfTksfMcMl84ZJt/DtO+J99blosukhIn/66eLOFhXjHq9Y3i+GDrmi7wzi+MKF4lVIRpwEy3SwaheiXY30K17al8Lx19nFb6R4MAHsny5BUURFemuhJ4p1zk+OAt+nhkOjoWJJGIfTZGgxlFN0JV2+IyMDnTVqoOxDjmNNkhQw87/HUYHvjfLmQwyYDUJBw474OmsiP1pPs/07BqioiHpzel9XEgN1K0rbDcqTR310XQmNGCvSUEo/z/khC3ktGEOwYqwvUSi9Bp281A0gLVZ3bkTqXxMcCfF6XnvNJSl9WABMNRpLojuU0Zy7uwYYTmdRntrzXCyZcIhVXtIWYEk2HLD+gS2QsjHt7jQr5M7S3lrIQpRyBqnBjCw4r0w3zXTp/jbbnlaey2c49A2G627E2V1jfYsrGNNsmoUMJc0S+oYg6G7OzN7SttFg/e2tKt4ywad4Og4ZAl7wrCycyYmX3SujPNNiAvFtj17w20125butf+Tj7LpwoCIwNSdou3ksa5QXOg6ZgBf6c2uucEpUM1sxELeyG/8N9ou18BJcm9uIEZpc2ggbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA515hSimIFR9c5bPQBsXqRSaWn7HMeSjOtVK7pX9sjudOGCdU50nJZ/++eGBNdqqumL9pq4b3qQB5ncf/8PsGCoAXiORrshW3Px4IMLIwEhqLipa98P0n1dgIODczO1BQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAApxgqREmATP5R+f6scFcNrvspDVJurRLlwLfHe3KoLoLJHVLsI1N6YZgqKXSwV+vsjvZ7/s9UBtjSaPwEZ2h9kj8MyGp/0QmQW/gQxSaVKeufJ+5hsSI1t5DbBXEcQ3B0GP6md8V+GULnAMGmzRY8l0d2s51Wc5Bo4f/W/ycJFVil5EbSdQGSPI9/zHdjZUz1maYy+/oC+nOcmkafeqqicwBdhREydOVmR2coOioYyLv6TXzkemsXOI6LEYCN9lq3aLXbEZZ1cD32cyfCr/n3UND8gMoHpqeFtHUeQ6OpH11snD1p0bAEidnr0CafVLlBXxVMJehcRWIYnO3GIEr0MTSKmF9v3+H+0HIv1OwwE8wloaWZoP94oWRj9yWG+Um7GpjT00JNoDNjY2VP5puFQlvkxtih7P/qXb//SiGnNsd6X2JgoeGSqT9Fh1cyhsYueOHoT/hgqrlFmGQ1RR4UW1gVrgRL3MZQDuVlZPgLPPOHW+tCfpnWAR/KlaRlG6YY5DkAk5mJdymSq/rLjYKgn+9QiQUwpvaINjiHoqd9CJucDJ+MdNE6lcLR17jmps3cOm+/c14k5d9Jcm9uIEZpc2ggbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMMqJ4E6g2Vbv/RZy1xbaIWKNhxzfqd8bwLIuOFiR553j/BC3EV1EdFeNhfg0nuw59vxcoHRp65Ky51mF+4qpiYsNHHeuKWIWYczpgI5zWUv5vBW+/thUui+CX3JegRX+CQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAJQSCkhsYcE6Blol6KMY76dsFAGrseCJ4Q5/igw+UXtQleJJ7SlMLNya3cahNsAoZh7y7PaxI3xfCsBt+5SvYk1S5ZFnK/ndMhQD0mvY8OjbDJ4K5w9msVv4Au5y0QrEnhlNNtKlkblb/fTdIfhi7CiW/GKphflwMWThUAqFeoaYKMRAlzeQ+fpZu1cGMEYtMEQW0s8yyfSLXO4KQX9fyb8K1pjD5+J+CsJULM7NtAIP2Jj6jaIoP/I//WON30aluCEYC6fi0k3jlmrEJgq4o6kYVaEZ2TH27LK0HyjrkHjK+2uoSXPkmEGFyC79AC3+EAraI2UUelNXU8jkxuaDPCYcn4pz+iW/tZBWIU+AjD5WgYKXJCItEcGKO0Zz2YYAgAAAKjPAUC1FI8psT5gt/nvFoPXu891tueWpOKCFunLnZg+Ous0PQtGk1Rl+D2mmqDomy0lzsH8RMgk3wOKlalx85vkIri40xtLDD2UtJPh49TZD8COK0TA+k2bXoK+bS85CoRPDDZQuZX0qdI8vpmpvDxFWNTbhKY2zlNrdlz//UDgzuL+2v+73IRQsSfHfMH+R4FGZTKTePYyQO517rmoeZEnQG5LwnBy4op3NnhUumwlOT2tf8cQpJubMe5FjKJ6OgFeRy23mEf7v0wJ8v9H+J6/JLoAGNiGRyQ5fswHWPiKoqxjMIFQOnuiegj1lc3636pe6s+ljLcXoWXuyY1iNX9z04CwFF+ZvKEkbOM41pMihIy68cTN3AM4tjuw2R20QUdVz8jnSIk1gT/WroapbcGxReUDA8lHnieB8g7gF9AHExDq0RKcxoEJt6keFkRLmfeaEu7Li10Itez8HpwRKxcI6wrbR/Cyu+Kati0aOwP8NKKd9hLFwgCcBAZ+qRQB8IzBKmXOU6yk6GfgIf96AtpKPytBJmuEpIjU5uuqFUUHghjZdXBt3kUG2Uhm3tNXkJHjDurcl8EDIrryp+W+WmI6nhRAqTp/pZF2YwdjqA5Aqt4RpfWnKFcTgMp25ezuELC92QD++XjXYALCdxY5qkOZvwlaQw2oICaA1YFOmbn6C2QzlqcQBpgli9gIvFO2eH9/OpL09hXp5i8Ft/UwNTXwnU+8CcbV0x4AsXSoI3qf9HGxsDQiZUeN4idTm2Kkba+/WKL7V4asQYjMGpLns7R6kZLY0RbEy6//71cZAiFNjjCV5GnhRlfjK+2uoSXPkmEGFyC79AC3+EAraI2UUelNXU8jkxuaDKVOojjfnhGf9GWMTGbgvJpz3nO1JHMFqzLwY4gERY4evDeXE959YjVCmuOO4OzULj7Zwzxi8pPmHp6YqfgnvQc="
    }
  ]
}`

export const TESTING = `{
  "id": 0,
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
