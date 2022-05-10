/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const genesisBlockData = `
{
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
}`
