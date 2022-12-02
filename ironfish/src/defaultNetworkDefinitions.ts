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
        "data": "base64:olY+vtsPDrhz+MMJqbnUkL+mWiK4fWidzw3fYGpdyiI="
      },
      "transactionCommitment": {
        "type": "Buffer",
        "data": "base64:gCRtQNMcl7qZDZevkWcC93Fw9Gy9OspVfMpSEe0KHXc="
      },
      "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
      "randomness": "0",
      "timestamp": 1669940082813,
      "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
      "noteSize": 3,
      "work": "0",
      "nullifierSize": 1
    },
    "transactions": [
      {
        "type": "Buffer",
        "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArVTEUMjzouTwZdp13wn8KqLCp02vdzRUWFSA+9e38sjDCELJxbXJLxFftRZrv+n2oGRdWj9o1tkISv/dYpvieajutxqXMG9ndwlsPrzvQBwp7m/RaRArLG2QWTkYSVhIC2F2LVEEX4qhhU8JadeFiJ7H54AVfuhyXuO05O4tGrEhQLKa1a+UNTU7rkK3A+pThiJc2p3EhiueRdNMUtKKvj/A0YELklBCgpAWMGHfFncf5eI4LYuWzR1U19JTKSvyhTq6QrM43Gd19kiz0HQkvonruyNTLkVAtLBxPHZztztHWS1v3b4057LRuPJACozlxZjSNA5vwNsLdCZ69ioRYrQDfuqHCZXIsKs8FHicWbdtfp9Vfq8c9O89fnSNfpzPpRuW34VBpDgRMjg1O8X1vws1lsbS2fmQCI8Ape2G3ltfLqdO1PA9mSsm7C40FKSNxvwabn6w38K1mHL/Ozp5hA1yrHuz1YORokymMrIJ6OCbOTin8tKbe7NInWp1f+uMw8bohWXG8l0A8qbNBpA0jM9btXvUW7LcTljxP/cxyi/Wj4oQA3KWx7ynugZ1QepiGKCNwRFr6gBCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMOb1cYV4KNVqFvYjBHwKzPAPfnKwTYgnfyV7jMdbIPFNXhRkWPb2H0aM37MkZlaoCxbbGT1WvQm4Ewc/k3zfQQ4="
      },
      {
        "type": "Buffer",
        "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8K+v////8AAAAArgc8TrYZqxDGIOD7p9umRsADFIt+Vyc/jQVkfKUlnySm9CUpfCbkLPaKeoBUHy6Hs7zEaRYEJGTxdk4tAfJJg/wbbWF1v1VFYQ+AaAuJB5c+YVxFI86ORP5wEVabVtJ4CGetoElx+QOAwnHwqa+TbQz+Dzmqs46JOxkJPAF0O97oWXX6rgU2NiWfnWHU76bKgAtIrqWD1H66eMd3dy+opUfNbc3YLtwt0Ox+x3U4jzYFzsioZ03/0Ugc/1Dj6yO5kPYkifwiwCBCbmkEZS9XXkClPG3hSwDMhlHF+omfMjlhRr5GA5SPwKGvij0vizAQUkHHqv89zRdB1Xons9mNZ9VD/mkDoIHXqpmUeNM0I6l4FR3lun2r5y8tmNR7Ivs8oHCS/AXQlOlxah2SbtTZmg6sjbKbtvWohAs2PPQhQVpOb/jgAVT59p6daYasqOxYgg3FrAAcchuEzZVhJgy0eSs/iRW7+eDC5XpbRvJ5HmVoPIovVJNKKdv+rrP4TGHsWq6uqqmZtYB45Uw5cH2BBTSvm2LUTgeaiEg4Viu74s0cvoOHDkLbnih6da9lSYZ35VdQOLKzdz5CZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMLwCkbVyq0acIA/Kq4dtHNL98DaAsuaN3U8kzhDhORzmxgumCYUIvyPpNQmdxxdC4EStvHtV59pvOUHsq3sjNAo="
      },
      {
        "type": "Buffer",
        "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjt9pezuAUYLzj9UbD8eeh1hxDjJb/HQNexOSwt0/mvFkXpwb+peqV156yBhw38OUhmSNmh8/s3o2l7HvKByIB5hgiLs9buCAGyiG40PrJ+LVNkV0cu3UcPKzUPZiUv1yE9gUSCGZyZvgXa+6WUR8fN9f3v5C2K95LD/ftlBN+uoIjhY/jLRr7rDKif1w3hOWgdmeRsjF1nV05gPYoW13zBl5rGM4zycsePmz1anY46n6vEfd7UeV2l5n2rGIHkJswhwEnxQ6vLI2Mq756xMIsliZT7inLgK5dCh0/dhEyCdO8kTtteyY7i3i3oiaGj/kyCmyQwT6rV8dSeXDZslxoaDgaMQUA+eqauTcbg7HbM4QS4cPwxwNOOZGFfN1tGEJAgAAAAQwB1ern43jyps00PGha+7Xe2OuUfxiPfjmSD9VwOuixcwn3XS6PVox9EspGyGoi99TEzVnTi2fBlTBUBeRy57zADiBWXZfFLb/oHwpwGgcNfbyLXmswYgLCJfBsbEGCYsca1zCNAqfPh4u0DdU/9uFmdmk+kKmeY9yppJt1sKow0pbXtP89n89NZ++qDDnkLCGUlUfk8zKslLYr+gOIsHDnuwCZW52MmTQGr+If6pNxeRK8HWNoW1DfitfFQSQNBa1vsu2aIFRqKureBogH24zQQ0f6RGN4T9fEWaKGH5EBMULidcZ7iVHR7wmRrscLpSmrlN/ePy5h1iA3U0846wBj4DLWb6Fc1FC6gI2iKJbGykjc0+dfAEuTnwwzX8FkkkP7vCzJ+xJsRjo0iTT3sIZN+7YxaUqcYS/xbx4MgHx7Cr8XkmRmJjvCqzzdAqoZUX1c7ffiFDvq6WnS8I2bWmfuigZ9c9+RR3F7w6iqnFRd6mV55NhGrFp9zpnkMk/430YE50Mv/sHXE6wCAieavhnR3WGeY+azuxzlMvoXXZGiQROlVD4Cn1wTmx+mSG6lfGNMp/gF8+Q86Y6K1UXpUg6Vwf0vkK645ypGAbZG6FOgIRmwxyj7qoaGW0FVxCmX8Px1jRKZmRanWHXAbTnviowE4srERsf4gm1GIyuHDETXEnEs9t6SVx+D3tNWZE0Tm/VZADnhPx3JqMCa8pQrd20gMthn8UIYhyYRsxr2Uy2HXziblRRpm2SJPFELkrJ1YddvMPR3NydBk5W9qwn8+hILS+4sHjgfV/2WSRhMyNM319bsX/Wh51ogtUgkTHRnwvP5I02zCdVLEbFIY27rUKsbm8PCHnRmDeiDouNZPNNQ1b/GKHycr4K/qX8HpcqjGgHg6jqWE8L"
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
          "data": "base64:olY+vtsPDrhz+MMJqbnUkL+mWiK4fWidzw3fYGpdyiI="
        },
        "transactionCommitment": {
          "type": "Buffer",
          "data": "base64:gCRtQNMcl7qZDZevkWcC93Fw9Gy9OspVfMpSEe0KHXc="
        },
        "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
        "randomness": "0",
        "timestamp": 1669940082813,
        "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
        "noteSize": 3,
        "work": "0",
        "nullifierSize": 1
      },
      "transactions": [
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArVTEUMjzouTwZdp13wn8KqLCp02vdzRUWFSA+9e38sjDCELJxbXJLxFftRZrv+n2oGRdWj9o1tkISv/dYpvieajutxqXMG9ndwlsPrzvQBwp7m/RaRArLG2QWTkYSVhIC2F2LVEEX4qhhU8JadeFiJ7H54AVfuhyXuO05O4tGrEhQLKa1a+UNTU7rkK3A+pThiJc2p3EhiueRdNMUtKKvj/A0YELklBCgpAWMGHfFncf5eI4LYuWzR1U19JTKSvyhTq6QrM43Gd19kiz0HQkvonruyNTLkVAtLBxPHZztztHWS1v3b4057LRuPJACozlxZjSNA5vwNsLdCZ69ioRYrQDfuqHCZXIsKs8FHicWbdtfp9Vfq8c9O89fnSNfpzPpRuW34VBpDgRMjg1O8X1vws1lsbS2fmQCI8Ape2G3ltfLqdO1PA9mSsm7C40FKSNxvwabn6w38K1mHL/Ozp5hA1yrHuz1YORokymMrIJ6OCbOTin8tKbe7NInWp1f+uMw8bohWXG8l0A8qbNBpA0jM9btXvUW7LcTljxP/cxyi/Wj4oQA3KWx7ynugZ1QepiGKCNwRFr6gBCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMOb1cYV4KNVqFvYjBHwKzPAPfnKwTYgnfyV7jMdbIPFNXhRkWPb2H0aM37MkZlaoCxbbGT1WvQm4Ewc/k3zfQQ4="
        },
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8K+v////8AAAAArgc8TrYZqxDGIOD7p9umRsADFIt+Vyc/jQVkfKUlnySm9CUpfCbkLPaKeoBUHy6Hs7zEaRYEJGTxdk4tAfJJg/wbbWF1v1VFYQ+AaAuJB5c+YVxFI86ORP5wEVabVtJ4CGetoElx+QOAwnHwqa+TbQz+Dzmqs46JOxkJPAF0O97oWXX6rgU2NiWfnWHU76bKgAtIrqWD1H66eMd3dy+opUfNbc3YLtwt0Ox+x3U4jzYFzsioZ03/0Ugc/1Dj6yO5kPYkifwiwCBCbmkEZS9XXkClPG3hSwDMhlHF+omfMjlhRr5GA5SPwKGvij0vizAQUkHHqv89zRdB1Xons9mNZ9VD/mkDoIHXqpmUeNM0I6l4FR3lun2r5y8tmNR7Ivs8oHCS/AXQlOlxah2SbtTZmg6sjbKbtvWohAs2PPQhQVpOb/jgAVT59p6daYasqOxYgg3FrAAcchuEzZVhJgy0eSs/iRW7+eDC5XpbRvJ5HmVoPIovVJNKKdv+rrP4TGHsWq6uqqmZtYB45Uw5cH2BBTSvm2LUTgeaiEg4Viu74s0cvoOHDkLbnih6da9lSYZ35VdQOLKzdz5CZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMLwCkbVyq0acIA/Kq4dtHNL98DaAsuaN3U8kzhDhORzmxgumCYUIvyPpNQmdxxdC4EStvHtV59pvOUHsq3sjNAo="
        },
        {
          "type": "Buffer",
          "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjt9pezuAUYLzj9UbD8eeh1hxDjJb/HQNexOSwt0/mvFkXpwb+peqV156yBhw38OUhmSNmh8/s3o2l7HvKByIB5hgiLs9buCAGyiG40PrJ+LVNkV0cu3UcPKzUPZiUv1yE9gUSCGZyZvgXa+6WUR8fN9f3v5C2K95LD/ftlBN+uoIjhY/jLRr7rDKif1w3hOWgdmeRsjF1nV05gPYoW13zBl5rGM4zycsePmz1anY46n6vEfd7UeV2l5n2rGIHkJswhwEnxQ6vLI2Mq756xMIsliZT7inLgK5dCh0/dhEyCdO8kTtteyY7i3i3oiaGj/kyCmyQwT6rV8dSeXDZslxoaDgaMQUA+eqauTcbg7HbM4QS4cPwxwNOOZGFfN1tGEJAgAAAAQwB1ern43jyps00PGha+7Xe2OuUfxiPfjmSD9VwOuixcwn3XS6PVox9EspGyGoi99TEzVnTi2fBlTBUBeRy57zADiBWXZfFLb/oHwpwGgcNfbyLXmswYgLCJfBsbEGCYsca1zCNAqfPh4u0DdU/9uFmdmk+kKmeY9yppJt1sKow0pbXtP89n89NZ++qDDnkLCGUlUfk8zKslLYr+gOIsHDnuwCZW52MmTQGr+If6pNxeRK8HWNoW1DfitfFQSQNBa1vsu2aIFRqKureBogH24zQQ0f6RGN4T9fEWaKGH5EBMULidcZ7iVHR7wmRrscLpSmrlN/ePy5h1iA3U0846wBj4DLWb6Fc1FC6gI2iKJbGykjc0+dfAEuTnwwzX8FkkkP7vCzJ+xJsRjo0iTT3sIZN+7YxaUqcYS/xbx4MgHx7Cr8XkmRmJjvCqzzdAqoZUX1c7ffiFDvq6WnS8I2bWmfuigZ9c9+RR3F7w6iqnFRd6mV55NhGrFp9zpnkMk/430YE50Mv/sHXE6wCAieavhnR3WGeY+azuxzlMvoXXZGiQROlVD4Cn1wTmx+mSG6lfGNMp/gF8+Q86Y6K1UXpUg6Vwf0vkK645ypGAbZG6FOgIRmwxyj7qoaGW0FVxCmX8Px1jRKZmRanWHXAbTnviowE4srERsf4gm1GIyuHDETXEnEs9t6SVx+D3tNWZE0Tm/VZADnhPx3JqMCa8pQrd20gMthn8UIYhyYRsxr2Uy2HXziblRRpm2SJPFELkrJ1YddvMPR3NydBk5W9qwn8+hILS+4sHjgfV/2WSRhMyNM319bsX/Wh51ogtUgkTHRnwvP5I02zCdVLEbFIY27rUKsbm8PCHnRmDeiDouNZPNNQ1b/GKHycr4K/qX8HpcqjGgHg6jqWE8L"
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
