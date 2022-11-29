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
            "data": "base64:QiOriNu9CPa8/xz2F3Gxm91gcUr6MtoEq1/iwVhAEzI="
            },
            "size": 3
        },
        "nullifierCommitment": {
            "commitment": "E2484D0BF38F29EFFD63EF9D5A61202F198129862B12845182A4CA77AA557A4B",
            "size": 1
        },
        "target": "11579208923731619542357098500868790785326998466564056403945758400",
        "randomness": "0",
        "timestamp": 1652195573568,
        "minersFee": "0",
        "work": "0",
        "hash": "226985356279BC9B6272337432C6B596F36740C7A90CD60E842A0153C23DE514",
        "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000"
        },
        "transactions": [
        {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAALVsFjFa7veNk7DbXpzGquz80vh8rgrH8hVzYpNBWnQp3sriKxnpjv+P0JKQNEQkNqjMWvH7DuBNPXIhQtU1OOk3isE+98urVU03vIu1VKhldCFbOc6FNBok66J14tDP9hk4xbDyDSMn8V4fyJTpVfWd/KFZUsecwP09TKKx66ZSW7JNnI37T1ykKno49CtlXrTAUNA7D8PXgP2NEeL2vx7UWpl2AgmxDoKYAL9BPllTOQqIm/jbwPmbtYYiXfnAuq+dtqpnHaBJ5FypfgyEO2EiL0t54ATYOnYjR6RkA0xa4/zzf5aJjbtGLNd6j4kdtF293jqJVqLz+8YD0Oid0zzKotQ4dv7qcYi62PuzQmc/B2bUPJrVHygVR35GLTkLavWC/vaOHk+4gGJCe86WRjIT7RI8vjrEKNg4soB57LJgYSDrXCMNZvedxjw0epP96Es9kgEFW4fH+33/JCgrmbbEuwX2u42xZzXfNvcVycRGlAqtz4Rner/qE2GVzJvnWklhYEJlYW5zdGFsayBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw9KXRDCqmM3IGFedvKyZeosI6vEaaDE862EktNfeJEaC7DAGOHy4UTobD0stSXCP/yguq4OdzQ1ndU3CdWhXRBg=="
        },
        {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAACA8UsfFPH/AAAAAKrYsEofZEDCEHX7xlLHu9xHFNovc0f5yTAjxnSutZ8XhDXMLgSg1nLtIH4W9HsnVYb1uxB+8F1hyJIb1WxOZhJXRz89l/xYlY0+GtDlHQQIOGPYz5AdWMzVq6HTWdC72Aje9c46bg5ouYNCRr/1mLKrzmSMykbj/rFFAf7xHn8cXipNh6Bn9tXr2c8/9KV+saKetuv5oxxv4b2ugve+n0rBT4M5X7x/eK/n/SJ4WKEy0u56i+bIWM37ldanVGdy/QY+NBeXIh3M9uyjA2P5jqQ7jYGlcY9vW8V7ok4OQcMfJ+hgLLyiEdKxAi1ZbcHA0o8Vei1PQvRQlZZv5RyeUy22NY/rgxh68toXm72QRXoAgLVs7PNufj4FWGPY1DrZPa1XhgCBBOs6yZtAaUhgRWFbw+XScSFv3rsd/bc9nlq6SYSOhGRvHd1/Hckv4jbsP9OAVuBTFNOxvyemXaEiqd3iOTVT7sZbKIEat4/TjR8GCixG9WASuK2ZylMeE2mwc2wGI0JlYW5zdGFsayBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwVtma3xejy1EzEbbB20lLj6EMLa3kWaHvxb4QcU4FwVTomaELUeeceLnoBSzHsi06PvF90jI30lkzREQ1T2pzAQ=="
        },
        {
            "type": "Buffer",
            "data": "base64:AQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAJJ+dYi9mGsc+th9Bzd77jeFFYA/TK0AOYPNLpJkqgxOBrLNHSw87drpAh4DRp+4Vpb97/WclXaPLwiAUmutWTK/yVSB3plRXFeQbKre4Td+BfN8eLsEUYkyD/DyLXk2cxTAuzF2K7Uucs3TdTt5ylr9snuDfmHRuphsr9sPLPJC6Q7LJalVbnhTyjtIxdCxH4baKBc5DAWmzMyDnZ2LkPVm+yMI/yA2tkDi+70oSXfNpFJhThutfogiXzTv8eMDe05mfKhGcIcNa8Wa4veP6LejuzKpAJhlYQY+jHjtPqWIH7gVaikGHORDhK9j5GiAZFAx/dvOa99EqeJDqqHEPBT+ggyHzpzhN9xrgpmWgP9JPDw+8txIy/EVrpMMqp51bwIAAACbJIF+WrTsx8my6Hg9q14G4pyf/bYTdhRsWJn2G82bmfW06HTWYUZQSFarUB0y/0FYh5+SbukcAy5zYYxJB76dJORNLw/uw4hJeun72IabpkC+BJ2AgkWBY+QjcP+wEAKgpVj/nlJ66mCsdtQp5byb8p9kH9I3gc/0TgsGBxXoEfXrR2g8mSWGtEl6MNTYofakD1smntaNlAWK6PdhFbzqqj7/Qd158xpwi8qp+nCMDH63ud6lGGStbdZD0LXZzaABW+zp5EZ8Mi+ZOSd5O8BF+/b1dEXyUfYTbdsZeaa+u1qES/mDotKbGwP5E/JzzOiVIfCpebaw59lOL6z/1O4EajXUigyMuwoPCkynbz/yWL+QCyL5NMuuj/eAAfW6lGZdikSIa89vi8j9JKdwX2UT3vTDQ+4q8sqtgCWMABvtyPhCCl2O2q9k+VBDSxIEIwo2QdFvkUDmsjRA4e7mciJP279Q31PioNg/qBUmdRhXNyFFM9gawcUr1w7YWWsOL8lt2CaX6jWEIp+5zsnAuo2Q6ENFCPhpXbPjcOquL5DlnIIXMRqM43aPFlEGT6NfGOVD/BS7I2aLVq1qla71oLmNBlYZ2lZtl3Cf6Ge+UtnnmiLaOulePy7NahBwAGNgECnO9WdkBJODBURLZ9CaeScn5Fe4EsuKMYDnnPrBo1/tfSToA3Di9P4UjABfopb1DTbIamEwplXhHeje/h6OZvf1QLxby23Y7D5mY4Q7seFOXbqgvTtn7thkvDVb212gM66+Ul9bGyv+bIV5Luj0LF+kexFXRkpsXWN9SRQ7Ka3rsliWqYj7eGd2NLwwpCL2nI/eYgo="
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
            "data": "base64:QiOriNu9CPa8/xz2F3Gxm91gcUr6MtoEq1/iwVhAEzI="
            },
            "size": 3
        },
        "nullifierCommitment": {
            "commitment": "E2484D0BF38F29EFFD63EF9D5A61202F198129862B12845182A4CA77AA557A4B",
            "size": 1
        },
        "target": "11579208923731619542357098500868790785326998466564056403945758400",
        "randomness": "0",
        "timestamp": 1652195573568,
        "minersFee": "0",
        "work": "0",
        "hash": "226985356279BC9B6272337432C6B596F36740C7A90CD60E842A0153C23DE514",
        "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000"
        },
        "transactions": [
        {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAALVsFjFa7veNk7DbXpzGquz80vh8rgrH8hVzYpNBWnQp3sriKxnpjv+P0JKQNEQkNqjMWvH7DuBNPXIhQtU1OOk3isE+98urVU03vIu1VKhldCFbOc6FNBok66J14tDP9hk4xbDyDSMn8V4fyJTpVfWd/KFZUsecwP09TKKx66ZSW7JNnI37T1ykKno49CtlXrTAUNA7D8PXgP2NEeL2vx7UWpl2AgmxDoKYAL9BPllTOQqIm/jbwPmbtYYiXfnAuq+dtqpnHaBJ5FypfgyEO2EiL0t54ATYOnYjR6RkA0xa4/zzf5aJjbtGLNd6j4kdtF293jqJVqLz+8YD0Oid0zzKotQ4dv7qcYi62PuzQmc/B2bUPJrVHygVR35GLTkLavWC/vaOHk+4gGJCe86WRjIT7RI8vjrEKNg4soB57LJgYSDrXCMNZvedxjw0epP96Es9kgEFW4fH+33/JCgrmbbEuwX2u42xZzXfNvcVycRGlAqtz4Rner/qE2GVzJvnWklhYEJlYW5zdGFsayBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw9KXRDCqmM3IGFedvKyZeosI6vEaaDE862EktNfeJEaC7DAGOHy4UTobD0stSXCP/yguq4OdzQ1ndU3CdWhXRBg=="
        },
        {
            "type": "Buffer",
            "data": "base64:AAAAAAAAAAABAAAAAAAAAACA8UsfFPH/AAAAAKrYsEofZEDCEHX7xlLHu9xHFNovc0f5yTAjxnSutZ8XhDXMLgSg1nLtIH4W9HsnVYb1uxB+8F1hyJIb1WxOZhJXRz89l/xYlY0+GtDlHQQIOGPYz5AdWMzVq6HTWdC72Aje9c46bg5ouYNCRr/1mLKrzmSMykbj/rFFAf7xHn8cXipNh6Bn9tXr2c8/9KV+saKetuv5oxxv4b2ugve+n0rBT4M5X7x/eK/n/SJ4WKEy0u56i+bIWM37ldanVGdy/QY+NBeXIh3M9uyjA2P5jqQ7jYGlcY9vW8V7ok4OQcMfJ+hgLLyiEdKxAi1ZbcHA0o8Vei1PQvRQlZZv5RyeUy22NY/rgxh68toXm72QRXoAgLVs7PNufj4FWGPY1DrZPa1XhgCBBOs6yZtAaUhgRWFbw+XScSFv3rsd/bc9nlq6SYSOhGRvHd1/Hckv4jbsP9OAVuBTFNOxvyemXaEiqd3iOTVT7sZbKIEat4/TjR8GCixG9WASuK2ZylMeE2mwc2wGI0JlYW5zdGFsayBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwVtma3xejy1EzEbbB20lLj6EMLa3kWaHvxb4QcU4FwVTomaELUeeceLnoBSzHsi06PvF90jI30lkzREQ1T2pzAQ=="
        },
        {
            "type": "Buffer",
            "data": "base64:AQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAJJ+dYi9mGsc+th9Bzd77jeFFYA/TK0AOYPNLpJkqgxOBrLNHSw87drpAh4DRp+4Vpb97/WclXaPLwiAUmutWTK/yVSB3plRXFeQbKre4Td+BfN8eLsEUYkyD/DyLXk2cxTAuzF2K7Uucs3TdTt5ylr9snuDfmHRuphsr9sPLPJC6Q7LJalVbnhTyjtIxdCxH4baKBc5DAWmzMyDnZ2LkPVm+yMI/yA2tkDi+70oSXfNpFJhThutfogiXzTv8eMDe05mfKhGcIcNa8Wa4veP6LejuzKpAJhlYQY+jHjtPqWIH7gVaikGHORDhK9j5GiAZFAx/dvOa99EqeJDqqHEPBT+ggyHzpzhN9xrgpmWgP9JPDw+8txIy/EVrpMMqp51bwIAAACbJIF+WrTsx8my6Hg9q14G4pyf/bYTdhRsWJn2G82bmfW06HTWYUZQSFarUB0y/0FYh5+SbukcAy5zYYxJB76dJORNLw/uw4hJeun72IabpkC+BJ2AgkWBY+QjcP+wEAKgpVj/nlJ66mCsdtQp5byb8p9kH9I3gc/0TgsGBxXoEfXrR2g8mSWGtEl6MNTYofakD1smntaNlAWK6PdhFbzqqj7/Qd158xpwi8qp+nCMDH63ud6lGGStbdZD0LXZzaABW+zp5EZ8Mi+ZOSd5O8BF+/b1dEXyUfYTbdsZeaa+u1qES/mDotKbGwP5E/JzzOiVIfCpebaw59lOL6z/1O4EajXUigyMuwoPCkynbz/yWL+QCyL5NMuuj/eAAfW6lGZdikSIa89vi8j9JKdwX2UT3vTDQ+4q8sqtgCWMABvtyPhCCl2O2q9k+VBDSxIEIwo2QdFvkUDmsjRA4e7mciJP279Q31PioNg/qBUmdRhXNyFFM9gawcUr1w7YWWsOL8lt2CaX6jWEIp+5zsnAuo2Q6ENFCPhpXbPjcOquL5DlnIIXMRqM43aPFlEGT6NfGOVD/BS7I2aLVq1qla71oLmNBlYZ2lZtl3Cf6Ge+UtnnmiLaOulePy7NahBwAGNgECnO9WdkBJODBURLZ9CaeScn5Fe4EsuKMYDnnPrBo1/tfSToA3Di9P4UjABfopb1DTbIamEwplXhHeje/h6OZvf1QLxby23Y7D5mY4Q7seFOXbqgvTtn7thkvDVb212gM66+Ul9bGyv+bIV5Luj0LF+kexFXRkpsXWN9SRQ7Ka3rsliWqYj7eGd2NLwwpCL2nI/eYgo="
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
