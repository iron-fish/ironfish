/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function isDefaultNetworkId(networkId: number): boolean {
  return networkId <= 100
}

/**
 * This account (IronFishGenesisAccount) can be imported to access the funds in the genesis block.
 *
 * If the dev genesis block is ever regenerated, this account will need to be updated.
 */
export const DEV_GENESIS_ACCOUNT = {
  version: 2,
  name: 'IronFishGenesisAccount',
  spendingKey: '0d8b17c1fa2d80c3e72231716dac64d5479a67e738846c65e92967e74facac72',
  viewKey:
    'a078435bf01a5eb3e49fe7f53a3d1e6bb48b12720c968eb935b2433f3921cf33b7161711ca49c10545431cf271497671ad88eee79df95f1c763c2a860f58a044',
  incomingViewKey: '6e45346ca2908ebff69c0b40ea6400c2242c4c7f79bcbcae7cdba64203acd903',
  outgoingViewKey: '7573bc11b9bfdf175e9d2f4e7fc31ba1c30cfbba55c841b9ec2bdf2ee7b006a2',
  publicAddress: '2bb137bcfebb442e91ac88a38550739cf5de3ce47f35de6de6b73485b78c1287',
  createdAt: null,
}

const DEV_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:NBKfT1cG/v+LljE68S/04Dqq2Eu8qQkc031bsYCVWkY="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:+dxdmAmJqXxsrDozr+oUVRBb3V3iV7lnfCgu3pSHxXI="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1681253460937,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHrhhnt4qjNgK81XrV6GQIv88AwCgGgnHabLsD8Nr2iaGHrBnzp6+f2vkITPpUkDFkzHDv/ZduJBWR88Vr7WoGBWqlxfMchUskf+tDvUSDu21d5orQe88kiWjgI06zVrQnDf/51DmhFkwMvYzqnRCzRnPe7iL2caBrLKKH3QUmbUKudFUyYiGSG4r5st965dsR5E0I2tcmIVTTUwJI8f4PAMHKEQUXHBcMMtEKJoQUUyszMac7IYh/grgthQP6hV1FKHpmtIolBnmT5C13Ja3uee0kHrZI9vJadVKTWyrQjdK8nn/PASiPwUmgRvPfBMVwT5dLoUZtBS5uoZ251DeLblJ9H7SvbtA3jnSxVeVa+y2C+7qTx3XXS2ib98b3e8AKy/WJFx9ypjc4oB1GkjnwjGCI39fg5IGLR1+hVy8SDutb9JtYeYZTI+KKFLa+djPLMzM4s/QqrHLm9HMqB7TUgilcRAVZbj7odSFu9nsXapjI9+zjMnl7isQbrAjbb9DJ27qIQC27i6CfTCLnztcTtzMHEWBRHs2O1m4M2tU9lMqHFJeOPJXOumdFOdLM6j2sOJRdLMbgiBdljADCCOs0dbfpajJCZXIZzoUgqpVhVEnnOx5QsyEcUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwYr1O0UmyujgrLXVi5WlzY+n0jeMWJAeWz1XaSxcFte/8cWoRLSx1hUgP5y7X3ZYbYeogF/9QpbrzxUfurcJJAg=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAAVr39bQM6ivpyqQxLotSA0BTMmmol8q5yubK98QfRWxaQAzkr0IdGFG2IrgCwhGv1n4fwXKBv8yeWcA85PUeNNq9IQkE6gSjLoXLTPs0t+tCyn/UwPaPys+3iSLdZBUvLFMjkgyrXginUQCaIRiBRspJKOrurCPc6pfQqQ7mkGw8R7m6Y/AB3nWW2m46jzlVOGrfBqC1f139ItzNQvOemXV/A6OI6+TMSDEWEoel6bhSI2f2fYjn67yZfy6A79OjQbp8Pc2t4oG9j59GXaAJlFBgKIyvSdcGe1oJxHPDaQULhN8RouGGSDkFb3Lu+V7akVzpT+4AtYCI+VpYFwYF76J9rLE1qV3dXiOigRQZxAoYpnAaNyxR0+NeS18WVCBBCl+pwUFyquG0A4p6pTomBfZtqnby7NsZOX8ILiVEffgcxy2Pv/hGDzeao4vI3r8cV7IPnSQDNlF6so5vnN9yGnGZlnmQ5/kzhtBKWz4wJP/L6GlkUerR8mBkf5Pc+KvWg9MLzjB2/s/NyoLXpDx7tWJPJf4pcyDhzi8doSnhsI79aLeejI+Lf6vaRiyagjc0dS2cTO3TULRGDK7tAO13iKig5wQkvU0oeegXYNMXnnELk+91pJwH2tUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw0WGTf1enKmETpmw3ql3G38WEu5HttrHDjYM0rhpF6G1u5qhLirZsGk/qnpI6reCZSOPEBq49gSdpmWiEw3M5BA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9W8d/Y8h/GoR8JFbDjm1bKTAnBafXREhOeQF674q4FaRXmkzeai3yl1JG6AUtdQGBknGYzsynX37qoFG0rdIX3+uCDuk+mUaQvClA6t17ZWNi9KrDtFWljc0sSwhFjLdN4uBB2Z8yLoC7M18/Q1zfL46nev88F7IWDHT9NjTdrYB6az+s6ljTT678hAVXOdz3E/U79Dy6KvHmPJrTwetnOiGLmnraVCGQ9KvxGYuNWayKnwL7oy6N5sT7JwQja7udoqEcDUNPHH0WJgRILMWzR+oSYeZoKVh6r7OSLkNWfy8S/wRQ3Nk7/+Q7U0lVcR/SbU9QU3g4kJTS2lMF4g1KRZwYsxc6p8m8HM6kV99/N/8ako41u4uL22QOv0LTzYUAgAAAKQXmEjlRLQd9b54EdOoNAuwWDBQ679TuqnBxCUn8tjWQjKKNUUD/vcs6OQofeisNv1cwMv1WZ7twJFvdY1EX6qG11K/KBFpeQezm5ScTwLNByPGBimAiE1/wjOgtD8ACJSttWdCw+hgMPCrV/cnAnZM+ojdePa6bS5d95a7B1SZ/PeZ+dvQCbe1CzxIJheYkJY4uJHd7CDb/+79TAC6ELXBIN7ZKlMQPNrae5Zn5ghf2+fBCQXYXec77qkFjs1Dsw7DXhhDq/TGw3S9FS5ItGvYH+T+Ie7+6xNQatNC5NdO2eBMZAvvd6N7yCs8BN7OrrJXDH/ght/4F78uGiFGFQsPkJYsTrfSmZpGImoSHGwh3nTYUPh5C68rY3nn7HQvXWCD7w3rHbaY7oFFHivcpoln4G15UYVwSAVXTK8tPn0765/e3xP/GCNWbQKrEsQqUCYvfn+HKoi0/AmTxb2oVG9Tl6qFAD3kncR3wM9Yvhnwuq9d+qAmQxYZ6LImK084hWvaKzBEApdLeGcDA9/NNdQftz877aowDYnoqJkaWIiyUW/ue+dTESXtf8AnbFnmLkIKSbfcJ9a79VVneRhOUHZ0kKCNaZXH28eLjvuyXrxA4EVvPLVNVDfLe5oA2dKIWkHijtTiSIKhn1PlMD/aOrZN/a6o8+wZyXHPg27s+02REGOyKtAnK9kUn/qaGf77r1SbsXxsgWfTaxZadqpwvbi3BBC4rUeWcf8WLFBot6bQgxTKWTLRPHWzVt4Ou0/MAa8LRo5nkuikGKl0AdFxhM+DjdJIhxGyUBmgcJrecqd/C1IkV37UJe51DSNmRZjKIg7NsVlYg3wzigc3GEVeO62EVK7l5PyAq8C64yJoCNjywnP+zzKP4UQyL7HitbfTpwY7z6CvoNEC"
    }
  ]
}`

const TESTNET_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:or1iA+MRyhHdvNT0xYwKiE2ftrNaZqd5Zpm1LW1tCSo="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:uwmRxb106Jk7P5CMXnvpkZ/PQnaWDgKdMvk9dshzQIQ="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1681253242584,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAN49BiW9DYzrnJUFwG+wtDlQOQcCGpw54yfpYp+6scNyrmreP3epIO4YKfsuMjqLG0A7rOoJIrNtC+gIEp6mznpAbKuIASbTfJ9v0GNrAafCpDsou0rZtSlppASvLpGSM2j0pUl00UTSptG426zTkiGcnH8yaWU/fPaktYpOKALkDg8SYEvfXMDBtF84XA2pUoYHxY/R5636c9yBHgAxHEkBO5raTQYxWeQ+x4oOvunGQ7H0YhV31y89EFWPTZjyPmw2/m1RYWnfhPCkaL6zLirSM/SFfFatruWlK7wDLQVbECo+cx2lSRgFCJytxTMEg2gR0USBnR4e8PkTRk55lkUkeRygxbW14i+wozgK6SDW1e3kfgmnSxBipwXfbcgdL6VjGUvMro84figzS+moH7Rf7yc68zCrmEDM11dA9Cx/teZ6Nlg4OmcvkZK+C4CmXwecIUYvLlWWAwEABheys5SdKCHE+UZwFd/B4T5h1vEephvQlDElUqtr1ni8NiTMa1fehPNgq5vcxjbEHmQsKKIlw1zjVm2FVC96A7QrqI/DxQgjOCVkzUswyAf2xIrD6CoW1tMV1LZAFugSYLI/VPhBPfN6SusNDRAc3s3cVUucWxXMU01ccFElyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwDA6ugbFpgxoCJ+gfvIBRSv1WpWBfvhtyrYQaFVy7Lbibo4R1ATq/0qiH22PUE6X7NzX6PbQNgtaMvHB7AIAwCw=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAABUoqD2DFS03192UTfmoBW1bVSrWrIhxB0zV5PJhzgUWAOFi2iuPCAE4oE+QxwxZ/X0ubDJ00QrEhUx8zMyVmZlT9ZQ9D+dP9+T5VV+yoRdShOU1Qzatj9+PEi/x8tM79eeKhScxSWJV9VKlVRJcfKrrMQqWNa8BtudxIa/8nZ1sFSIkOXfp1QcJtLNojyhK+fNJo9+bh5NECrVb+4yKyof2Nfr5K1bQQmRu/QqzWT2GTnQX+e41DYhtidw3iqHsApQhplOqO/FMsjhXKuRTUCt4gnEYKb8li4SlNPeXOC/5bSFZUZwmDYRWS6Gx6IL0eFqf4ocs1Wi+HUzP1AyRgjI0hJXGvuNDdZ2f4F1kXbEZgAvzjJHmVtsaATZuCw7kQ7s2llnd+k9+90vJa2oLIElfQ1u1i5K1AdfHxy1wv2QqiDuNYhrbnGTLZT3kjhl70fgJrYIvf+bBVVTyEwgFe6Fx2Z34PQrYsR2Pn0BmnYuH3G5lOxqY3XBgR/l88zzSR5W4hcZ0CWoriiEnu44czr7VqXVIVFY5ejTaCOhrt2zOjk9aNbwLLenbGeog/pTNv92+XuXXXik7ic75wxQDtvjZiTLlRxWNZGj1LCM8aJJKK6bY2fVLHJUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwXsHTqk61sHo3wg3cs12EhLL4KVvMb1UUySx7qIZ5bjQNxv2uzEw3sw+Z1KK+cMM9ujfwiiv6zW/4X9ItN68zAw=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArRPYLylTleZAtzTqJx213HLjBT9REq7JfM1UMMfBgaCs+vG63XaOLSFG+AtAr0+d6Cb4L9Cvm+4yyB+3rKRiG7BwO4R3LuWg/GmugdJZNBWyWwNV7UMAaM+i9A//CIapdhtvMi1mdvrvboqSnpy6S6WtMQ/66Q9gjCjRXC+hqTIXTDW//Bo4A6Gr6PDD3Dec9JYunWDvJPOMGFXZdE29AshrlS4ldbgW4I64eUKfB96FiTU6dWwAyYLVXcM1VjL7zIIcDhtph5c3p66cR9bnxnCBw9CtOAtOix40oZmhlKyutJao3Nyl7UpFTv/TSwtVTxSdLqkLbfH/dvr4Nbvjb2jjYfF2kogm1xVLIOxgZDQJlW0RCo/Y/1qRnsHAWNAJAgAAAJpZUnF+IKK3CMn4A0G4ippF4t+jztaeXJHLg1Ds6tpwO9Sy0/NCafEQ4vuLdf0Mkc+oGz2Be+vb4dShBwBLgjKe4wedZiFA707NuDeVA/BjJDmm8FM+MeV1zXf2a8RODrLxoO+bvHroxCTNjWfYLIiHZoIC6jW+zeB/q0IVeHbN3u7R2u9oQYbsK2SNSguo+IA48SR6YxSFmHNo4CjFPAfdhfQh2MN3ED1oNnsXd8sO1Y+6jD19nbe3ZXK/CUkTeg5pl+nxCnBT81C/pl00tZHtH77qIxgf5neVf+5CR3G1URn/RtYoypod/5x4aVKw0Is3w+4P09lwBafDjvnpnJO8kdRv+tcObxRvPIy01RddhdOjPjU6SViEuL62rDbAC83Hizpd3jeuEM6lbgT4qMnXH1TyNdMUE8XRZo6O3xOj4LdewfQG8qMfM/+nJFjYjx8bias1D7jroA3cCQARSwr6V3pVp7KbOpjQ3iMch4lznqU9Rc9Vhcq7yoTXz3TgtCg1m41/sBjJYRLditnBAyBcvxMq4cDPPU5ISFVSphogRalfI1D2iEG89hydhFuh0dwqfgrxQ1LRbva/DhHqtzUUwjgbbACaWlE/7vYrlcGTz7YlGXLkB/cxbqw9HHg7qSUSQXjbRZB0gvKbIjeEWuzmutinbHhsXrpEiWofEpkvLEV6zF3h8R7A3L41ETcG10sxOycWijGWZvvBj8LMa3rS+66QVPHXH3VgpmEd1nosHnrBUz7sXX3TOIpA8h6iSVETeVgO76fchCkyvtakL6KkcLQFnQZwLsvQ7jDx877xCRj82BfQOZmv2IvYxxyOQ/L/w1nz/7MVEAAfxlhwctKuzyf4KaHMJePCJvj04iVCWrPLSx/h/5UQDvQ1+YVHz4PKsyV8masA"
    }
  ]
}`

const MOCK_MAINNET_GENESIS = `{
  "header": {
    "sequence": 1,
    "previousBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "noteCommitment": {
      "type": "Buffer",
      "data": "base64:1iVZFtw6PoLu2ux7KXuQUv929wjNhy1KpOHxWQvJjVQ="
    },
    "transactionCommitment": {
      "type": "Buffer",
      "data": "base64:0VJbatsMRP0nMWQT9hMTo6jrLBGiWwuY553hcy0MByg="
    },
    "target": "883423532389192164791648750371459257913741948437809479060803100646309888",
    "randomness": "0",
    "timestamp": 1681253405047,
    "graffiti": "67656E6573697300000000000000000000000000000000000000000000000000",
    "noteSize": 3,
    "work": "0"
  },
  "transactions": [
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7d+NhKATeJl1a+Yc5r5058V/wHmb45q1ZjieOJZJg/CGN4FROSKAk+WxfLEtHwWvsQDoG/cYKUx0ZZtdJgNCPLAAz1FbMuGYVjjs4Ls65LeFkbKavbYkTOXuwTOES0d0pmDOv9d3HRmKmmDOiqJ3NFToWO39e0mgvgzRbu6pWs4PG/vp5Xiy7+adNAg1wbm9nwwl6x3FKO61EOfS0dXcigA1GMc8TzdfyyAMA2kBjguBiPPZ+8onxja2hmNJXvM+BOMxg9r3999D//D5EYkVHKU/N+tg4GQ0A/uSb6ysyerl03Fdrax18tEqfMnQ8QXeZrEB2e0ObHWL10ORnRbwQ6puIrvJ9fcVxm9fg32Gm0VAYXsgqYETwyj43ZJ5/YcPlRd9tviuZPK7KKvDT/u3r5uPOel4X89rHGt5laq1PHPKCFJdGxdVBaa00pLtdObrgLY3GuiHTLl4D79kLY0k0cO9L5ifMwDdfn2Iaw4ZsHX7sS8ANk4JJfhcHuN+2T1QDE+ZgMJVAT7zwUjD/RGQzMaob9PkxJZtuWGiLyFBBLQf5x7gBxh5/lJ1V2xd0grVrFStlZlQRfzej9pnjJleBHBYOE91e+xQ0P8hvtYBH5hYJWjA5rJiiUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwKRxi1dBn1FpUDOstNBL6O7S0ehtRgHoHIpZXUTueFldobGDNq4MNC3m2P0yh96yFZrZBYMvRFhz11NtKEW2zAA=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxSx8U8f8AAAAA0LwvWU69o35JvBM5nSPJ2r3ruSKNgZdtVB0fgL/U5rS0iIME8VlYsefqZ2jTBEHTgts1jEq2NuMlraAMo+6TbrfbaFKHz1SKHpSJb8rEOi2ZAgSEYaU1lDpdkrFhpTlDvzOIWYkS4qHKevNbMYFsJFQL6rRSU4oaZKKwFCrrULMH8nBfz+siTQvyYXDIQvDuOULhnQWXakvYghdoq4t7c1RYT2gL8Jt9gz2SCXt3q3CnR1yyFi96UxefMCj71SjLui02t7hIQq9UPTDRMpvXt8TQV5y2TsIMti8ATy86untrAulXJDT38QI/UOBnLdylDWnbRBFHXMPxKAs5qkSNFHIpYLyk0tweE1atmpsLC00fh1Hvxa7vT8PJUAWbXJNfnyxgrlyhl0yYLbTuusHybYuVZrYkxCizaSywvcFwNgY49NfTIfmtk1Bg3YW7dl3N1GbY3Bq/VMn1x6YLQt6x54W5kM3WRehu50DWUx47nVAVZDzczzCiN7U8s5z6mkSkMBZYUnC8xAioBg+Uy9NIqZxDC71U0pajxpLxhWSE83/qbnAEuZR/JXX6t+Ifsa5OEFnareeVu5c4juusHJk4uQNIeVXRxjdF5YjSiWmXMXk1pi6FHI1rhUlyb24gRmlzaCBub3RlIGVuY3J5cHRpb24gbWluZXIga2V5MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNOt2XQG5zUdPXbCAg41N7M7QEQeNHsnK5hBSRwN1/+kPvXJ58lOlPbBbmjW3aDZLa0pndldH8y7bpntHu2IoCw=="
    },
    {
      "type": "Buffer",
      "data": "base64:AQEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAk7MUEBO0Pnfm7KKxes088xYk/EghDmPlKw8EjQu5NcSnLvUojdXT8yRKzOv/SKfHMYf44yc8VWNTCYEVGBo5i2uuCUR+NzvbXoYC3cANFxCrIBHhsi6CdtO1+rPYtGF342XCeSzTv+RnOqrsjkUpBT40rXBkvJ0mharjdbrHiSkQZUzpiRckts18bvj7HCYRZ+2lNJM7s/jwROn3QgKSSigWXDmxi7WTakJNO1IZ4kWQIMIor5y07Bkl5mRScugNFI57AZeYmVxZskPlpfSbF1sLBxuq1FAQocpTyi3ubODQKGUYV/7PjeXpnT6pjEOjiuv9bDn2MWuUWWe4FH1XqZ6lbHEe8JYwtB/5DNhy/jshRN63/y4CU+lg1Fco5G0vAgAAAG1ZPsHTJOOaVDZIZeMvX4jmpsmo/qOENSgl2wPYpARSgUaioyjNWlH3Oy/cWpQGiXJaWeWePlCt5yALQXYfAQCGVtdHlnLRJwhY5OI5tCoj9z6Qy77A9AukEPxtstIWA4RW6QPEgI18NDoXMk+2aY6c4LiBlbssSN3AH7ophaVzk3/9u2u4cyzSCrwRN12hmqD5EEJWdjcfGefE5XO8JdCdIMc9wvtUUDlGsE57bTvcT6SZtRSxqdG3/UtOEDHOlRHEmCGUXifDtBaNsFHpmkfoc1ILCqHUtSu28mEhb2miBKn4OcUUPMA48zcWj1hE9bSPNiYgIFdX/obVfXVPbmIXU/y1jvrEarWWSKKAVuOZu2iBtdbCTejjstWbZtjOtAJ93RmAGiKWiV6OhXmqtoXjfrgsXdW28PbHoIv7Fh/qiBxASpt8ZmrZWEbkXNAqVESaiyfJaErvavi7AfACuEByUc3VLj7GVQS4YxaWDJqhM3Bt91XAajJTqO5dzhg4sNESSKF4FVzFX/R7lvXyPbUKYBER35RCP8XoZ3dVoQjA0aS+EgC7YSpbEpWrzhe/XoEkvFxecDd97O3n64JZY+kuEhpvJuOP/R8QzXQJBAVL3+yHCdB8MDbJt7HevutArCVc3lQuYwoTyEV9y8kaXkziqvTksSNyT4eaDE1D2bpev9A1Sl5Zx2zgMdNcTqACTXuiojYXFUJJEmNtuk4MMbNwLVlawKhhMm5ztD9IBPuUfiP5pa8aBgmMiXDmPfvTaj1bS+jGxVUl+PcUrv7OMnYLawGY0fCFd6euN+N/xZUeWscuw5NqZPGdxubzPwqHcXk+x/eAagGIeY5b3WJFcLbVRKzaCt+ynRjGMbyvFKXJCL4de9LsAddbBeUvHfC1KFPfNKHMmx4A"
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
    "genesis": ${MOCK_MAINNET_GENESIS},
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
