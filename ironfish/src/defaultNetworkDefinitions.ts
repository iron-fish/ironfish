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
        "data": "base64:bMNKDLGJy6VZIlwrU4qR7UHSJ8K6zi0kx6uC5IiefG8="
      },
      "transactionCommitment": {
        "type": "Buffer",
        "data": "base64:jtjUaPaJsw5USxu0OXW1/F5SGUS+dT8HBAUpFE+cLR4="
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
        "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAo2sLCTiRqW3qdnFpcEmNZ517SlPO7n0fvvZjeBAgO0/3tpPxyapra67VAD1E5XKojmPQAWxNJQNp4SyVxC1l24EcloFUGVR/N7fAnJ1WGmhUU/VqvBiQEgEs1qY0ngWcATiDex7dLxlOJMJtiFXg12lXo80sbA/+4uLYSMhInjLcm1p3wMYN5FTz05j20/cGp89SvujRXn+t08PkSpuRYOumVQfH1UmIHmVrtbGUqKdkBUOr5e+Ik09pT5ql2L4WMCtQiP6rhneO3hi/o9jnA9ySMFBAuud5ZaEM2rcq6qGzb4ISPezUnmIUjfNqWzRllTLvDvLQ2YNcOevWcPA3cXjLl6z1MH4ZNG+RE+NC7Qtk2J+48n+ab1/5yPQ/AFqH4wdfhyewTPTiWfd7R/wqvcN1O0X0fXZDjrP9/V99lVyBvzN0blc9YXddscNH08kT6hDtfBVARkJei1PgqCuNtdDvm9KLX/g65hpjJYl35JVHokLo3uLVemBPSXCV5qIPluuf56DXZ8EtvkUMv8sgcxm4N7BDfjb7QmVhbnN0YWxrIG5vdGUgZW5jcnlwdGlvbiBtaW5lciBrZXkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDCN1fznWOtmKDZ2op31PQ2RdEnmzv19LgrtyHoF/0wSTNiOK04dTL79bQOsNOwyrKoYpsG2w7RVUp1XNU3yQGwA"
      },
      {
        "type": "Buffer",
        "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAivUla7Bt7UU5LDv46z+YIMGKBqS5A95Of2O8N7p24wiqx2weiYnjMQrfFuKyiouZgmhdORlnTpn3tEiDxMC00N977XgOFo0CnF6BZvUjkFAz7/D3hFOUh0DHCYo/dwDpCpebhvyPsI0iZ8Wox2URBz4QuK5Ks7OF3GAoQ82Kar90y8xath2MwUNKilA5ZcJgrf1AmvVp6pzetWxRE93uJ+bCi7xbCWne7R3pPlMa9BbGQQKqsF37SnOnKKKnd+Y+AVvmZaRqPA6NkpM6jm1TejXs+yvRPDqmOr3YRaj8+dihpSrVNuO8GAipCg+t26WBK5YALBqx6pD0L0gWK2uOakyQfo1zoGjOlu/S2wBkoi6Fm+tbndb6ItSQBNtIRHkFldhiifNSwMLhJM8RIJ1srkCklsGxgyYrgS8eOZie565mziqj7PRca/M9F/0D3DdrqL+OlQoguP625GGzCk2PR1UduAa0bz1KOb+64gWzevpEBSVYO/2/+1Un2Lb9PnI4v/pN7WKOvHen0uiQX+r6kW7l0Okr6vGtQmVhbnN0YWxrIG5vdGUgZW5jcnlwdGlvbiBtaW5lciBrZXkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDCkn6Y0E605Mj2+nyH7HepSShbspJnc4Ku1LJINBNyG4MgYZhuSBzGN3hOseeuoXfuf2xgMCVmNdr6ExXeUOOYE"
      },
      {
        "type": "Buffer",
        "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAk9O3HuBunk0wtmT1OblW3C5t3TEMFCi2rD2mva2TBx9MhFTa/3UeJwPOxyTd4CGjs8aVY9rLJvb8h1lN/4mOLQrDxRmZxad/0cRxT6uRIRHRV2NV2t93RR+8iARcO08bGL7v3QLCyRmZDROEUN7Mp6mcQT3ELKyqf8oG2XU7YuxGt9euhH2ey2uM15EYTMmZl/ELwzMM7kCxjtyvgpzbvgmOGiCQdWJhZMzqa7BbgohBaEOpwJvkU3NWogokCOj/Wj9c1e45okR0Uk47bmxjeMyPxptnhzBhCEe1VEqw3GVb9GruZNcOP7f4nHgkY2+JqH1Qb43bR1+uuoGytmqmByl6Px7X2DMT0EMNwcI3mM+xAnqiIWO1fxQ6cAsNQgJuAgAAAJBSed70xpy9gwqwXn7553a5eBOqG+K00wlqqYTiFC0M+j+tGImuADMyYj+7MD+1JtCrO1sGbkbOXF3n2M520wlpZ8uEqlwnfbhy2cFsKJwzaUtGXHIkQ2dQIsO+XLQpBrFj5qurjTRNQt7ae1roYgAJFpePmHJSSKIWvyHDVZY4K0kz46zsiZ8YWf/kSJlb3q0xswNwzmFJ2skzBIqZBge3RFq5VCEIlciwbYWVUKf3JaRY3Mq4TkvOfvbCgrdF8QfArOp6Lrdj2SVr4DAPfv+tG9VWoiDzBuN+ze7vBBoWL8HPsqSAR77lxxDWgtRFBJMgfoZFJDnYSeuqqDDl9SGcggmlqb/zAVYHl+cZYNV1qPYB7EoCqdh7MKUJHeMG/VP6Vcfx4w9PavQeiZS4dfu/ttm/FrZA2BfJlMVUlsufT/TQizhdqL3lueGtUrptdorXFYrqkLdSkTL7px4KVy5PyONDKxM9T8nFjDpm99c28bw3vQX6of8rS1Ajs4b1FhyNKAa3B/77guCylB6ZlX/I2LK3TiX0KatbiR6/5zPUdaYD2G9vqcuYx17Agf0EP0IK2mVWKUGGOOevCU5HXv7KnfrTi0Ml2S7zT+kgzLzPMj3aiM26ANyhQf3sBa0vbE/ZwEM4zWduK/m6/6Fk/k4YXP6ySteu+UERGcz4By7NjxG2M5KN6neN9QWSJ5OjMT5zWOVvE3BKG3DsPmIdrhgtrVD/EUQ4x7z/DtVil1LqpsphBdqWBO6lDzTdXywmaORbubGVRNH6JFLhszjgJe0BlFXuEeCyiss71I7dfSlP5eANSjQPPqQRZ1wc2lev9wGpZGVY6QE/8ZTqgS3tPUB+5HqLJ6DrBQ=="
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
          "data": "base64:wQugqoAkjjargzkuEqn+LSXxAvlMp5ubeAgHqpUmrAw="
        },
        "transactionCommitment": {
          "type": "Buffer",
          "data": "base64:KYJk06s6m1IblZiINE3U6cGN8YLwNpmawcr7N1XoqCE="
        },
        "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
        "randomness": "0",
        "timestamp": 1669940355519,
        "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
        "noteSize": 3,
        "work": "0",
        "nullifierSize": 1
      },
      "transactions": [
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsYc5fP4JYoRCtm0LmG9gXsoCG5j7khFxfhLyWbCEkRl2lJq4Bx7GuYn8Eg+g7nq7jEYzXAFsPHOrTNWYbiz54yzvn1Q9c3f9uKdRae4Dda3F+vuI/afLidFHxFP9+VdQDSflNz4Ka8BSSSf8TOsw70ohPHZ/Mhisfp31D7azk43optiBRabSlyBKfPjCsxRRtYfnezhxmyujBV3QnRHlje5WyBgskk741HYrdDMnIvHKM+TsPtIf7V5QgNXb6zKi+I22nXa6LD2DgT23+cKwg5MZ4VYXyum3Q6YtodpvaeQm2/Aqgv/uneCo6kxOyK/+KZVoxmHu3ZAPQjdSZ/ZfDqioOdA0SC92qpAjou7K6t4OYAchXt/IClMzUeUx4SWFzhToc+pfP/FRLZwo2nE2RHCGiSASpdHIM2InPBusEP5KTIMdYmOT+6o8Kl4w5EJD9SruCghn0eXTeqa3I786+nLPcmc/d5o0l8+ar4w8lnm5i+DXlUp4U3bZdCjfpIDrWNTZxNhKDovJweQxRygNVm1kogF0Fbk2QmVhbnN0YWxrIG5vdGUgZW5jcnlwdGlvbiBtaW5lciBrZXkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA3XHPf0rN36Px5eia6wDUosAz+emAoYL9XFBqd0uDwMLjwbrsLPHX2U+mzy4Jsoa76qomUuszosmdd4B5oaX0E"
        },
        {
          "type": "Buffer",
          "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAsA7AHpnPNyNTQRGWgWB9FMZVHtp/TpL9owd22N2JNhut6SRSwXNFHLOYOAZXBCiYpdfkZZmGyz9m7q0AfOKwGpntVIdWrau7YO+oSbMiJwFuBgZKwBeqFjuUb5C+DqL7BGMZyC25Am48+jnM69XqpTVYAJVwBiQZfmF9UGrWZUJzRZQWweZ9gsh6+0WDNTlHj80hNLP6Hd52jvae1a5mYV8/y6iltH93g+oj8LhEM0HShPeUx04adOT0jZuqD9879zDdoFIh3xODu/sLMTCERrjaPyi273mR7TPjbmh6A2vXB/wjt+fQzm9YtVhwgiU2Z9rlLOvQ+e2zfYemJb7WJc4wNs9DrQh9YKPzfzh7h5TSfL/s+ib4quj1Eqacqm/btgHWxSfhKivXPL+bRyo+cAKsK6+3/EHdvYtZLRbi1XM3X6glJqV/Rnkh7U8UGtwm/7JPR0GZqlpnh2rc+umAv0UBN94IBlFi820tTVYRS4DH0IRno0ChJUi9uRD0EZtvqg4SF5FrZfz6ft/sw9eXn5DzuTIDYIkNQmVhbnN0YWxrIG5vdGUgZW5jcnlwdGlvbiBtaW5lciBrZXkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAJOCWXNwJQ8XDlveCTJaIANbLs+x5aq8Kz9QScq4bvO4RYiDoH2WuV0/siZ4iQzZCin64Wemlbg8jBWU/obRcE"
        },
        {
          "type": "Buffer",
          "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAuO2w8b5hxh1lqYwT1PNHS3QDYkLIq97jh8B0n0adIvKfwwYJwa7o8tdbvIxtYlvep/0YghAjTRhjxdQBP1P8hGcKcCqm3x3L4zLjGVQRU6RiImMGVCZgP1Lh2yLUJCCsDpTT7YWcdipmkwGr0mzgPx72ST8BxtBiKItP+S4UHsghV/yPhns/ol7IWTHIMJUmh3Ms3utcOQDf1G83spzLY5he8MZ+ZzoLj2GrWRe5UjUm0UdUy+7gQ+rnoNvEooA0bIjhPELqIz+UCtMI8ibWp3oxlkO8VVfKH4kuDl4bHiO8POZ5NglD2d3kZRE7X0rRLknPjInWrZwXixcyaxBFZ8r66sP+7yOMa/ow5VcxJl7rqExprGZdrb0ZMlAAm89iAgAAAPWzEPHGPIdH8vAMW7IDfNCiW4QjG9FIgPSv4Vl9VcMEl/h9waGqQ0+69d00YkvX5B+d9Qeep2+Zh6uNcxoEWMq9BWI9F3X39nDSdrm+3L+BKFr6HYE3Kf6WFiJvj820BbKPGmV5AGX4rACeX66QdVwAOjFjRpFCpCltxyJeMSC/d2Fn7rGHHpisF8x2FhI5y6gr0SJW9J0AoN88sgm+ycMGiDYzdNrLvL6cPoo46AO89GcwANz1Oqo7wEU4s5M4uATV7K07PvU+W4aPXr85wdUI0kmcTPyKsR9HKjJbhp6R9k1+nUGTpjfRHFIyZ44wwY2i+iXv0uZHY/nfC4NXOABGn7K5xjJvFtlccOYOq4O2Ixo13MnxZ1JTvT42N9+fAunclLXYyr9RJE+m3L7WWo65GVFXyEo6LHYrDh2c+yWSYbSwd5kOEDYuiF/kat0v91qLANYSgAOBail7df0MoCrKZp7VchsDu+yKLZkMY/J3g8MdgnRs1mvIEbOT9EPA2HpN51/mJPaSwG40PsDrb4iT9AD8uT0FPCjwxWysezk9N6XC5/LEfx9XYyDdZieOFldiJa2M6ptXLZw21isIwm4dBCxO5VrjUfK/uf1WWGEZmTsAWci79LwLlDvzx+myL+Jj78uGzIb7BnNimoZjPWw1tbaW8y+tiBHgSBlMAgb6Q/3bpvA8WyLgUGtC4VtC9LjP7cXRQSwLE7EgLnw+4epKS4QB0Narqad81A8PMPoO2Y2rCS2GIMaDfz2+q+8mpiNa2NL3jtMN63st8jrx9V0QlGK3D3zbl4EmUhCXdd6dWtHajGFKNQydaxF1ua7CSM5iy/tBRSXiC+2AyLY16Rp4MCzzPepLAw=="
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
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 2000000
    }
}
 `
