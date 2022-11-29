/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const TESTING = `
{
    "id": 0,
    "bootstrapNodes": [],
    "genesis": {
        "header": {
          "sequence": 1,
          "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
          "noteCommitment": {
            "commitment": {
              "type": "Buffer",
              "data": "base64:76AeW/Y/OReid2EQ5DQGuBLEja7YRmo0cPob+89ARxE="
            },
            "size": 3
          },
          "nullifierCommitment": {
            "commitment": "75B6424460A60EF177035E4265EAD201B0197A1D07989619E67C07575B53995B",
            "size": 1
          },
          "transactionCommitment": {
            "type": "Buffer",
            "data": "base64:9yLLZgLhmgHVXR6hNDjWjdyZG7sn26fRbopqclUv8rM="
          },
          "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
          "randomness": "0",
          "timestamp": 1669687518300,
          "work": "0",
          "hash": "EB130E1173494EBF5290F42B4982E08978291980A666F4AC020DA769F3BAB121",
          "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000"
        },
        "transactions": [
          {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAChdrO0kkN+UclprTXxOqdIuFrVo4pQRW++ZwXsW2mYScBT4nKz1zT81g6CsA6qvJelKtnXPeU+K/uItHZvIz637Z0foSS8SyAUQnzdeHESJbJ/mF1sLCboFuj1J6HSbEIEm/D6yN28UlMTptTvNV81jAz7GMANz4A3bPY2Zi0G9YFri24shW44esekNrooydCZRlXbKIquQaQwek0d6b9iXYMR2djkB9mfnK35Bg+NYk8ku07/BFEzypKKtI0gvqhm7aTYNi16EmQTdE2+2iBgF6x8CoMadm+ZzWsxwY21Mg79t2CWgvDO4qjOVVpKgcsgG+eINSBHBOOT73uoJd88JIjSeV24KizOP9FqJJpbu74E3Sy9LeArSnZc9I7w43NrATy7jFIJ1d3OJXHx95n5IBDafoQl1eXzfbl7O+ebASX/dRZKgpK3MH/GIjrtkbi+Z4z8tItfTRj6/7qNpOvGSWpXTngX9X7H9vDVVHfL+88LUrzJpJDbK6FP96Srx3XDC7/7mL+tWU8xMKb+Vn4Ao0u2kO/tEfFCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMBmfF59nTHQnsS4NL1H9bvMuHJm1QUvD0DUrPUrVy+VUOja9R2Le4WHA0IFSgOAbL26taTgkppKsQ7UHaRRjQAs="
          },
          {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgPFLHxTx/wAAAACKmJ2BYGzrbBlGGoAGzgidK1JCPxYBkIbMldSj5URH8fpTlhSdavSlXh4XhUCtgkKSCoGfL/NgH/H2QZBEhm5lb9hmwCxDxvaZCQVUJEcTa8GVoErD+et8ds/tH9VRwtEJ+P0Lyz1FBHH8fRaKl16D9Ykiu8hOBGk9b7q5MLjUSOQBiv7gzmdhe04R1U7CeJSLtY28dbr7BZCBAa/1rwm+Og9FHIZpBeHJW77v8OzbmY3X+IGGpHC1Idhrbi8gz/8/h/4xXkPxjCgIMuzGaWc3mZeeWyuvm2CDjTE9Fex/vwukryA20nsqeEFfOS88RPqIOg2EHIp/3KJvpGBsDoplkt2OHHVl788eRplAP/Hj2jpt56PtYhn0aTnVegsH3C1e1rdh/T/fpzVQ7a4Bm4OVQsTtSpe5Jc76gMS9uacM0l84U9KEkMYXOg0M94iOsDJ+WuQJNGnPWx+YqjiG6l4rD11BSBJNQShHXofL8H8kNPdLKU/pmXOkT0wd0PmBvQYXpl6Y3IEloNk0ktWpZGwmExWAWLFVTMBCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMHCHC5ubKXC0h7ZlV3jCaT+X4t3j1J9VeKZBubb/i5Hrdth4fcyOjKCV3bAE5V8qaUtM1zH6FXbJPICkRH6liAU="
          },
          {
            "type": "Buffer",
            "data": "base64:AQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACkbw7faqPTKG5mgrC4x7JQnStnrNmm9szmSDtlONEMqclSdCh/gGAKQvLClSaIsyyOocooVFPb5byQjRm7x+LIhqqmeLXVRdmLiN1ZsfaTmElEsdBdShnhaQlrqYDZuAkQSoGpHQarycx5svchUt5/WoxR1zi9p/+VtkxLMhK1HWUQrWEWZwzOfH61YH4uKWezlWPm9BD3agyiUZ74Qjua1+ovq6bFZOwhyWcJfhbGwy5XpF9lha/mjdPeGMdSpYcOSi10TxNcyVU4RLG3CxexsXVOYshrSYcHkhzsXi3t549tAiV4m1K83JSKjc1BqLO97TvRVFwinEltonY24jTj30dX3b9nlIHfe3NniKcmH2SaIGZh8zKnKIWm+YDJ5GkCAAAAjvxMTKqgQjgfHcH8gN31oNMXBEHF+vz/2A5CW4fMEegH3ul1V14kIqM3Mv1eAy3G4hF1ofYmOB4NAEpCHi7+SQ6UaPlYNVnBtZv59bGlZY6J+xuVCWokkfWAxERFWTQGo6Xb9R2ycQMwnrfexKm81YAEQaq79jJ9UDIkH0biHY+lz5GQmApSvSvlBNc1YPhEoRUZn4Kv4jtKDap+tb8r6NNnuC7BdL4fZbvObgoVgno29roY9/YizgENv7Px0BtsFRBLT2ScFHe1WqjjTsrAdRIo7VXaeOwhDAwvI3EY2QDhkF5VZD1jz0QGIjz36Es0i3bPK/FX4EVnXRfPNZgr0ftOYddadK+tU12DS54eGznPH+tAjpv7F7btgP24QA6t2kYMHf9WS5n7+AEKHrsYiaiYr9Br7JkJ7qYoxVg7LFEorded3DQrtz9F38m91bOxWQ61Ei8UVknnryhG+28TOL7DI1zNQ3Y5rkI6DGEcC2zNpMfGY2lymv6jfoQnIRCgynn18ITgyuHlt6BuCkuikLS+tU6nbV7PMd66WJ9bACb894ya8PlkKhaxFSO+dZcbhwJTG8f8e/x4N7w5lGZYGp+Rid0PwH2ZebfAyBQXf+BjxnDZX78Kquo7zoZFArDblYS5wes99HMxH7IzhBPjg9qBGbnsGYoN2p/E7/qyoE6pw83hq3b87P1zhnU7JhFhdX5Pmv6TXWPk5MnNL866hSmiQ6WXJeGbvlbXU6EkPHjYsCmukpJn6ocbllSYi4mv1JikgkZ1jv8C2fjw1xdoj67CYQQ7RQqskU7L14kjHBPQQOEwVc5bAZlwcdF2kt2sWJl6mjdSnf+vHIRXX6o2h2UYC7PetaYM"
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

// TODO: DEV genesis block needs to be updated with transactionCommitment
export const DEV = `
{
    "id": 1,
    "bootstrapNodes": [],
    "genesis": {
        "header": {
          "sequence": 1,
          "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
          "noteCommitment": {
            "commitment": {
              "type": "Buffer",
              "data": "base64:06Sl4v9BqNu0nwgft15kBtk2AHbSKX1w65Wz5h0//gk="
            },
            "size": 3
          },
          "nullifierCommitment": {
            "commitment": "68412AF594D80DD8D651A57F4D8EBA7F37D88419AB0FF5F90E6517CEB0D6D3DB",
            "size": 1
          },
          "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
          "randomness": 0,
          "timestamp": 1638249991358,
          "minersFee": "0",
          "work": "0",
          "hash": "4655C8E9B27EEC8129830AD94C970A0AE3C2338B8CB29CBA3AB572ED65ACAC1C",
          "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000"
        },
        "transactions": [
          {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAACA8UsfFPH/AAAAALORnqi6D08L1OmA3cJrqB2708GHV/p8nsA6/1imWc4CPTatZT2cOt4HPVPtYf28HrTrxs62H0RNLgC8gYXGiZSDHPpBWplvjbNaVuhJ/RKySZMeTs97rvHQjX519kMqiwEp5MnsZSfV/mEQwPRp4xZ6WzHL7ExDywqgs6mXbvHZ6RC9P3Q/JobDsKMrIerKCKtf9vjAEkK7QHAVfrKMJK1KRLDnsfcTf+RK6b3Xukia6nUnwiGx8cStJOfiTAAhK0Ha4BiXhZfdJcq+UWfMder47zvRaOM1HevzCvYj/lhi/4w3TEMvpdjFk7Q3NzENR0W5iiNCe6VFvrZcuGIb4kVv81DxVyhVi+4WjCR2iLdW0L4I76s6tjPZYvcNI6cnF0LsqT6OQZrohQVWPXzIQKzYGF6phdLI4h/oJLl768Dzno9RzODFOagfDbnu8asekopWwvCsHgbmszGJoPyDq5c9BoT5xqw91oqPIAymx81HRQGVhj0VxL13NqsUVCzGyslJ4UJlYW5zdGFsayBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwXkm+XAzIUZy5nmoCgTgvTud0iIp7KvFo9KVxKSueflQ7j4w1I67lekj97ciW1gfxjaWSv7qQ2u84DNaqp1CRBQ=="
          },
          {
            "type": "Buffer",
            "data": "base64:AQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAKWmLvnOp31ISzmxMjs0pYXFLPvYxM6tZCeDM9BWd0N8StXDYUzlvDZvkZsfLvkrb4L/XCrfOcqLEikw5Fj3gZ2h+mHJmaiAyPqVyqO3p3ngyqKr7e/e7U0+UbOH0KBA2Qdjfjmu76P2fQuRbDvVkO3uFVJbP+lveXUJ6ko/rjY0Xq9KXxw7Uk4v7gzN5wBJrItMFUykBnP3dp2yqdDx4d4uhXFMX+FIA9PTZUx8Hz52Owv/eisoWiQlF3WJIm/Udb38da9C7LkGJtpMxnMdz862qP2cKQNA86M7oON299/U35kMvVKzFw1SUEfsnbrWZEUQKAaHqxleqLsxahQmwROPEhwxs/feB3TEbk7pXLA+X/0pHCVC01kd5P+oQbZENgEAAACEllSuAWkgtMFQdrqtesvCfStVJbXBNfYCwAghMDHMVACzanYRu6NrO7SEtc1zaMnxm9gRBoh6fS4EGOALOOGFiQTGywD0JK08rFjh37E2npiRPUhJFnBpyRNY+i2+ZgK4GAspxNIG2RENcSh7eUvrf1ZLI2+/fyByZK9yJGjvOmS1ZxygtsqpcMkDfXtnjK+Jvxq4rY7LWsrK682Gl3AFoyyTC2J+ze2GN5ikCoeaIBeBm539yZqF5pRqNekkaf8KiCW8MeMLV8Z1Wf9mSRHGgsICVOi2K70pG+NzhEmEGaZVaA1uRk2r73d9pLiT7OiPmRCUDCDiXuWCleC8kpQplP/M9oKibuEOG4Nym1Q+FjFZxIxFDrB1b/803h2U9WYbruq3ts/7rBHglNqUXCT9Xcx/qZUW8dyI2yUHNE5jrzaX0qFk7/ZYZMIAR47f2Tsg4NCScNiTvbPvZUXuqTMsLNcKP/6u4iuZECZxsT4dv3+mLxPePmhTKILxe4JtbRSbSt7Whht454p4IAw7ZQsh1on9ZRS3yeOMyBn2xjXvRNFQTuGB7xeD0HrbSyP4obCJxVFpliYH2ZX9JUd6NNF+E5cgxWLQmeqlWxgUzL3SJlNrmnKWaib5ju1wxXtsJ+3TIvbPwzoxenTUe0W2UkE8V3b1WIdH+ft5SPCeHRROSc/WfiV5Bvcsrn7wvQbutESAhhH+t1pxeUVZEBCNdMrJkNR9G6gHfntRzyyfYwn6a1VOaJVLEMpNdrocfw3yeHpcWtb2Qhphhxaw8JQ6FpLjoeBa/b4gaEy9/3EEvvR/qN3fxjpOMnrqsptLo2SUsYAxmAw="
          },
          {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAJmzqDypaErItO8J9fszIKnp1UF9XqzHCUdFVlgzB0nOxSlxUedeK1eAKiRPs9H7gpXyQwLkh/Rk48xkrHNOlIjoA1L8ZhD49quRDU/ShRb/ZA0FSKVSmCjhJGroPCv0iAOtNsa+fX9xqbRpk6G4lqtShybM0bZ5MbFL2NeB4l9o4slVaBIPG0QHCY8m9Kui7ZST3WJR+xZCs4WkkNCP3XZ87mWmzx71iZbdNfb2m9btPq75iX9EeTxZHG0GJthgh3ToBVugu/h2E5uMuDajLyN4m7bBClN9V/uaeXxM073nU/nuOdaJH784u7hncF68spWz7f6pj6Zf0xU/BCAlikErd7KQ5JUMCHgPst4cZajettXZUwck/0sv9F5hBDLwaz9dpoJFgWLiNyic08k74RzhyTU8sPsLeZ7a9wj4HdgNgj8nl4jemXxR5c9t7cclr8JPwZnLEefwxaJY8yRfARR69tKDKLDT2sDuby2Y3DhGUHuaOXA1IKrh58CTQJkzSkt+HEJlYW5zdGFsayBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw75bGh9LmRK+TjEY5UJbRapCBAfsVPXoz0NaxjuyFez2X4iDHq6v134fmVZOogIajhWsyQEOCWnTxAjA+0eKjBA=="
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
            "commitment": {
              "type": "Buffer",
              "data": "base64:76AeW/Y/OReid2EQ5DQGuBLEja7YRmo0cPob+89ARxE="
            },
            "size": 3
          },
          "nullifierCommitment": {
            "commitment": "75B6424460A60EF177035E4265EAD201B0197A1D07989619E67C07575B53995B",
            "size": 1
          },
          "transactionCommitment": {
            "type": "Buffer",
            "data": "base64:9yLLZgLhmgHVXR6hNDjWjdyZG7sn26fRbopqclUv8rM="
          },
          "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
          "randomness": "0",
          "timestamp": 1669687518300,
          "work": "0",
          "hash": "EB130E1173494EBF5290F42B4982E08978291980A666F4AC020DA769F3BAB121",
          "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000"
        },
        "transactions": [
          {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAChdrO0kkN+UclprTXxOqdIuFrVo4pQRW++ZwXsW2mYScBT4nKz1zT81g6CsA6qvJelKtnXPeU+K/uItHZvIz637Z0foSS8SyAUQnzdeHESJbJ/mF1sLCboFuj1J6HSbEIEm/D6yN28UlMTptTvNV81jAz7GMANz4A3bPY2Zi0G9YFri24shW44esekNrooydCZRlXbKIquQaQwek0d6b9iXYMR2djkB9mfnK35Bg+NYk8ku07/BFEzypKKtI0gvqhm7aTYNi16EmQTdE2+2iBgF6x8CoMadm+ZzWsxwY21Mg79t2CWgvDO4qjOVVpKgcsgG+eINSBHBOOT73uoJd88JIjSeV24KizOP9FqJJpbu74E3Sy9LeArSnZc9I7w43NrATy7jFIJ1d3OJXHx95n5IBDafoQl1eXzfbl7O+ebASX/dRZKgpK3MH/GIjrtkbi+Z4z8tItfTRj6/7qNpOvGSWpXTngX9X7H9vDVVHfL+88LUrzJpJDbK6FP96Srx3XDC7/7mL+tWU8xMKb+Vn4Ao0u2kO/tEfFCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMBmfF59nTHQnsS4NL1H9bvMuHJm1QUvD0DUrPUrVy+VUOja9R2Le4WHA0IFSgOAbL26taTgkppKsQ7UHaRRjQAs="
          },
          {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgPFLHxTx/wAAAACKmJ2BYGzrbBlGGoAGzgidK1JCPxYBkIbMldSj5URH8fpTlhSdavSlXh4XhUCtgkKSCoGfL/NgH/H2QZBEhm5lb9hmwCxDxvaZCQVUJEcTa8GVoErD+et8ds/tH9VRwtEJ+P0Lyz1FBHH8fRaKl16D9Ykiu8hOBGk9b7q5MLjUSOQBiv7gzmdhe04R1U7CeJSLtY28dbr7BZCBAa/1rwm+Og9FHIZpBeHJW77v8OzbmY3X+IGGpHC1Idhrbi8gz/8/h/4xXkPxjCgIMuzGaWc3mZeeWyuvm2CDjTE9Fex/vwukryA20nsqeEFfOS88RPqIOg2EHIp/3KJvpGBsDoplkt2OHHVl788eRplAP/Hj2jpt56PtYhn0aTnVegsH3C1e1rdh/T/fpzVQ7a4Bm4OVQsTtSpe5Jc76gMS9uacM0l84U9KEkMYXOg0M94iOsDJ+WuQJNGnPWx+YqjiG6l4rD11BSBJNQShHXofL8H8kNPdLKU/pmXOkT0wd0PmBvQYXpl6Y3IEloNk0ktWpZGwmExWAWLFVTMBCZWFuc3RhbGsgbm90ZSBlbmNyeXB0aW9uIG1pbmVyIGtleTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMHCHC5ubKXC0h7ZlV3jCaT+X4t3j1J9VeKZBubb/i5Hrdth4fcyOjKCV3bAE5V8qaUtM1zH6FXbJPICkRH6liAU="
          },
          {
            "type": "Buffer",
            "data": "base64:AQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACkbw7faqPTKG5mgrC4x7JQnStnrNmm9szmSDtlONEMqclSdCh/gGAKQvLClSaIsyyOocooVFPb5byQjRm7x+LIhqqmeLXVRdmLiN1ZsfaTmElEsdBdShnhaQlrqYDZuAkQSoGpHQarycx5svchUt5/WoxR1zi9p/+VtkxLMhK1HWUQrWEWZwzOfH61YH4uKWezlWPm9BD3agyiUZ74Qjua1+ovq6bFZOwhyWcJfhbGwy5XpF9lha/mjdPeGMdSpYcOSi10TxNcyVU4RLG3CxexsXVOYshrSYcHkhzsXi3t549tAiV4m1K83JSKjc1BqLO97TvRVFwinEltonY24jTj30dX3b9nlIHfe3NniKcmH2SaIGZh8zKnKIWm+YDJ5GkCAAAAjvxMTKqgQjgfHcH8gN31oNMXBEHF+vz/2A5CW4fMEegH3ul1V14kIqM3Mv1eAy3G4hF1ofYmOB4NAEpCHi7+SQ6UaPlYNVnBtZv59bGlZY6J+xuVCWokkfWAxERFWTQGo6Xb9R2ycQMwnrfexKm81YAEQaq79jJ9UDIkH0biHY+lz5GQmApSvSvlBNc1YPhEoRUZn4Kv4jtKDap+tb8r6NNnuC7BdL4fZbvObgoVgno29roY9/YizgENv7Px0BtsFRBLT2ScFHe1WqjjTsrAdRIo7VXaeOwhDAwvI3EY2QDhkF5VZD1jz0QGIjz36Es0i3bPK/FX4EVnXRfPNZgr0ftOYddadK+tU12DS54eGznPH+tAjpv7F7btgP24QA6t2kYMHf9WS5n7+AEKHrsYiaiYr9Br7JkJ7qYoxVg7LFEorded3DQrtz9F38m91bOxWQ61Ei8UVknnryhG+28TOL7DI1zNQ3Y5rkI6DGEcC2zNpMfGY2lymv6jfoQnIRCgynn18ITgyuHlt6BuCkuikLS+tU6nbV7PMd66WJ9bACb894ya8PlkKhaxFSO+dZcbhwJTG8f8e/x4N7w5lGZYGp+Rid0PwH2ZebfAyBQXf+BjxnDZX78Kquo7zoZFArDblYS5wes99HMxH7IzhBPjg9qBGbnsGYoN2p/E7/qyoE6pw83hq3b87P1zhnU7JhFhdX5Pmv6TXWPk5MnNL866hSmiQ6WXJeGbvlbXU6EkPHjYsCmukpJn6ocbllSYi4mv1JikgkZ1jv8C2fjw1xdoj67CYQQ7RQqskU7L14kjHBPQQOEwVc5bAZlwcdF2kt2sWJl6mjdSnf+vHIRXX6o2h2UYC7PetaYM"
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
