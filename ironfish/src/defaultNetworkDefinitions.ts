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
      "data": "base64:RMPYdKIA5kXgUe6D6L65XCm6KEEJkmms3dl14ptgND0="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:C2OkUNnXvZaMyXWr5BSpDbB7wPNXze28LnTcu4jYNBw="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1679335852385,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASXAYDH3Dpwbh79cBysX7AcIPSEPYAvqbTmBkml/QGfKxkDXh/h9s6r4L9cF575LU8kfBI6epaskLsytZ3PdQSXByPR3nTPIxxWQDCD6llPqBttD1x2EJqee5JB6Jy9TwMciSgop+i6jUEpBCE3GES5XRkq8QRJczoZK8QiDws3MW1w1o1qCRmmcAbgLAgTCy6jmvRlIhV4F6SasI1CY7S8SJANYiUeahz1ZcAZzbezSJJDQk+sIJIxkTFBdtxasNprGK9gtBw+YJrkV82audebLD+abJ1jGtliEKpjsYqeh9jWWMUUAtx6snaaGe68O7SL1QMHBfEBLAbhdkd2MnJn4JXjuRxGqVRBE/eiJqx+SRUEEhWZj9z8BzqRaUdpBVdYhA9mOQPqRKd0opyDYQ/EG+r+mJuuIkJNcpdH9IgyHx7EgWVFAzgMt+C6pywe/FADMxtVe9U9/YuQ2YrEY9B5c5gjiHLtNW7bZyQ76sp9IwXp5paIQd+RMv7JRYy5rkErP8sG+OVbhUMawn2cv1EjTR9yaYOu3rYhiTakIPYG1DaCPdN1W6sqgtJ2Xt6vc9224DoKMH62PBcsEEbbKa5zVgPYOl1gZKJzjat+eAwmFusWaS/LnygUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwyIbJO9f34HwOCl2bhksWlYY9LKgYBXKQLEoaN8E25CueUjR4/VBdRln4Xm9xxBBtQVF+YTcqd2ttk9XLZezoBQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAVCnJyUXVgdaUOXaDjAJhEZOjOyfqJxnPeZUGJ3ryg2u1y+oBc10bFPxdC3mj9QvYMG5rFv+FmA60mOfYt59JIeHjHNxaARHXf8XJB2Z3WLy3oc7ehfLcHipL+w2mNh9lNXnLsERBwqQtyQFFK4Hrw4QgUVRRs8BNwfzfjyipZsQKVJjBoeHlxoF+rFqfMoGulRHEBdkTd8tf/Gs7VjHek+9RXkrvX78PeqCkjeipxumkaBy7XYCZ1APow7qj9BlO5ufm7QpXiinVOdSweqirky7Pt9F4rjXyGZ8Wj5J3XjvENvrcsxbhNxgukoPXjVHvQ1lA+gBEjItU1Q9InxEhI6eSEIYoyLyMThL49Dnl6V3ne/478skt1JP7lWcm3bVZCDnT+PoMJcwMolCKOeWeL4jRWqfjcKrPExJVGfFT9RQad1vnwH1H2Us871fB34w3zVIwlpr5cQqN3IrL0DT3hOhBj1TaAwZc2yXbZUxkpY91JNknfpv6Q9/3XFbcR1692xYNw5O+jFlubFbHeQTc8QoLOWvP1PJHalItj5C1yg2BPR6RY0e1etCksjMZkGa7vEp/BGNqBIjGpC/IT5byQUbCXBq93+4Cb4mCvFd9GqJnuDsaO0C3G0lyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwD7sKLvVvPnCpdcxSDOC/tAIOX7bgHnc3utEnr1NdvrAaGWNN28X9K5q5wE81sG2oC/08xDR8snyMHYmuqdt+DQ=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzjZNxeUesZ3dpcqPlbXNF4RhhHzEOleAHvVE3y/3heqs85Wc1cPMDyXy2vjRgoXuiPE1ytDWYJ+NyRV5QAA1WxYQ1p3J8OMsw7zO+1VBIR+LyCx/NDkIM4GVQepZ30/hhbhOZpmCoVtQokeBqRQ2g8BRy14BR+0t1KMgdpKiPy8D87iswV2x6ZMksIAX/nBwxHCTswF+YkFv08CZt0ZYuCesiAOGNt8cmt0vzfD5TL+VgYEYb682hCH/ZqkupQzahy2vXyG1TzCG75eLJLEVA+85efhN9nOFMvwKeL35ZxuHZKOAbkLGOwK2+et9srML0b7cR7f5Yl3VSVlp2ySuz16Tze1GksVLN0hTu8hhBDLOymaw3xnTfhhwqeARc60hAgAAAJbCRxFLicPQLM0FQyGTXfZtnbe+dlaaSlPjVypHR1Pa6Csg+mDljJ7jaydLKzG6uSAIAyRK+igoUGVNfY+mnc4AYNolxowHcxYbgspZD8H5neAl7dG1dcRlnu887ZS+BoSweLOmLVC4Z1Is/F4JDrWInMGLAPnzHbmLttE/Mom2oqaR8XWVZ3I3i0h6FsXX+piYEmvi3RMNb7ae7JmdwxI1VZyn8ulRn1KKjqr/iSeOVeF7awX0+PE9EGta6tee9QJbqf0XcH5We1jWnmidNfq6p6ARj3yEt+Zt3pxVIUtPmLGAcuHNdVC0JyT7MrsGaYZnGkUytLSWY6oXA+bl9n7jL3CAZMPLnhDCfQJhB7/DhIzOhs8LlFK281A7dGQ6rt7fPskWWLgqbJ95063yJYexQFi6PKELssHeFEeo45MwjCH3QDrmHD67sX0W+6iySGR8qW0N4+0sEWM/ZiL9Vmx03yGjSp4tYZmtvQ9iUqhw0jwn6DotoxZhaEMvOPWf5oD/LzuRAfxK0obAXbo/HcwySoTO7P7/K+CzWVkhACDuavY31/MeMPDCkncFshW7LlrLu8RwxYAceX08Et8eNFDP8sqqqgnJ2NPgh6hna3ku0T6Jiu9nQ6/oVKjuhfH4v8S0JgzEtEbmuOoYt8dhP9rF9G7cXLlP+y1W5HKuTgvE7Y+EKcG4dHOiMrHLwQErSatpW/Sh2572PartwLs4GD2j0JKrb8u7RS7/3sKWbmKmj7KMPiZp3uYIff3k65ZP1dRJgLjyDUG28Te93kNBKnSyOku8A+XXdkeGf+PE583FbERBysKGcxQxLQHdudA1TE9FokyG2yqIxkpoUODoA+H/xBbcylGG6LeLGisWP9bDIpYrl8vwHmETD2/eDmyH2v5ChO7bm4YI"
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
