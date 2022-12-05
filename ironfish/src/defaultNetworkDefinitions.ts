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
