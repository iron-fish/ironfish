/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { CurrencyUtils } from './currency'

describe('CurrencyUtils', () => {
  it('encode', () => {
    expect(CurrencyUtils.encode(0n)).toEqual('0')
    expect(CurrencyUtils.encode(1n)).toEqual('1')
    expect(CurrencyUtils.encode(100n)).toEqual('100')
    expect(CurrencyUtils.encode(10000n)).toEqual('10000')
    expect(CurrencyUtils.encode(100000000n)).toEqual('100000000')
  })

  it('decode', () => {
    expect(CurrencyUtils.decode('0')).toEqual(0n)
    expect(CurrencyUtils.decode('1')).toEqual(1n)
    expect(CurrencyUtils.decode('100')).toEqual(100n)
    expect(CurrencyUtils.decode('10000')).toEqual(10000n)
    expect(CurrencyUtils.decode('100000000')).toEqual(100000000n)
  })

  it('encodeIron', () => {
    expect(CurrencyUtils.encodeIron(0n)).toEqual('0.0')
    expect(CurrencyUtils.encodeIron(1n)).toEqual('0.00000001')
    expect(CurrencyUtils.encodeIron(100n)).toEqual('0.000001')
    expect(CurrencyUtils.encodeIron(10000n)).toEqual('0.0001')
    expect(CurrencyUtils.encodeIron(100000000n)).toEqual('1.0')

    expect(CurrencyUtils.encodeIron(2394n)).toBe('0.00002394')
    expect(CurrencyUtils.encodeIron(999n)).toBe('0.00000999')
  })

  it('decodeIron', () => {
    expect(CurrencyUtils.decodeIron('0.0')).toEqual(0n)
    expect(CurrencyUtils.decodeIron('0.00000001')).toEqual(1n)
    expect(CurrencyUtils.decodeIron('0.000001')).toEqual(100n)
    expect(CurrencyUtils.decodeIron('0.0001')).toEqual(10000n)
    expect(CurrencyUtils.decodeIron('1.0')).toEqual(100000000n)

    expect(CurrencyUtils.decodeIron('0.00002394')).toBe(2394n)
    expect(CurrencyUtils.decodeIron('0.00000999')).toBe(999n)
  })

  describe('tryMajorToMinor', () => {
    // Randomly generated custom asset ID
    const assetId = '1a75bf033c1c1925cfcd1a77461364e77c6e861c2a3acabaf9e398e980146651'

    it('should return iron in ore denomination with no extra parameters', () => {
      expect(CurrencyUtils.tryMajorToMinor(0n)).toEqual([0n, null])
      expect(CurrencyUtils.tryMajorToMinor(1n)).toEqual([100000000n, null])
      expect(CurrencyUtils.tryMajorToMinor(100n)).toEqual([10000000000n, null])

      expect(CurrencyUtils.tryMajorToMinor('0.00001')).toEqual([1000n, null])
    })

    it('should return iron in ore denomination with even with incorrect parameters', () => {
      expect(
        CurrencyUtils.tryMajorToMinor(0n, Asset.nativeId().toString('hex'), { decimals: 4 }),
      ).toEqual([0n, null])
      expect(
        CurrencyUtils.tryMajorToMinor(1n, Asset.nativeId().toString('hex'), { decimals: 4 }),
      ).toEqual([100000000n, null])
      expect(
        CurrencyUtils.tryMajorToMinor(100n, Asset.nativeId().toString('hex'), { decimals: 4 }),
      ).toEqual([10000000000n, null])

      expect(
        CurrencyUtils.tryMajorToMinor('0.00001', Asset.nativeId().toString('hex'), {
          decimals: 4,
        }),
      ).toEqual([1000n, null])
    })

    it('should return an asset value with 0 decimals by default', () => {
      expect(CurrencyUtils.tryMajorToMinor(1n, assetId)).toEqual([1n, null])
      expect(CurrencyUtils.tryMajorToMinor(100n, assetId)).toEqual([100n, null])
      expect(CurrencyUtils.tryMajorToMinor('100', assetId)).toEqual([100n, null])
    })

    it('should return an asset value using the given decimals', () => {
      expect(CurrencyUtils.tryMajorToMinor(1n, assetId, { decimals: 2 })).toEqual([100n, null])
      expect(CurrencyUtils.tryMajorToMinor(100n, assetId, { decimals: 2 })).toEqual([
        10000n,
        null,
      ])
      expect(CurrencyUtils.tryMajorToMinor('100', assetId, { decimals: 2 })).toEqual([
        10000n,
        null,
      ])
    })

    it('should return an error if the given amount cannot be parsed', () => {
      const [value, err] = CurrencyUtils.tryMajorToMinor('1.0.0')
      expect(value).toBeNull()
      expect(err?.message).toEqual('too many decimal points')
    })
  })

  describe('minorToMajor', () => {
    // Randomly generated custom asset ID
    const assetId = '1a75bf033c1c1925cfcd1a77461364e77c6e861c2a3acabaf9e398e980146651'

    it('should return ore in iron denomination with no extra parameters', () => {
      expect(CurrencyUtils.minorToMajor(0n)).toEqual({ value: 0n, decimals: 0 })
      expect(CurrencyUtils.minorToMajor(100000000n)).toEqual({ value: 1n, decimals: 0 })
      expect(CurrencyUtils.minorToMajor(10000000000n)).toEqual({ value: 1n, decimals: 2 })

      expect(CurrencyUtils.minorToMajor(1000n)).toEqual({ value: 1n, decimals: -5 })
    })

    it('should return ore in iron denomination with even with incorrect parameters', () => {
      expect(
        CurrencyUtils.minorToMajor(0n, Asset.nativeId().toString('hex'), { decimals: 4 }),
      ).toEqual({ value: 0n, decimals: 0 })
      expect(
        CurrencyUtils.minorToMajor(100000000n, Asset.nativeId().toString('hex'), {
          decimals: 4,
        }),
      ).toEqual({ value: 1n, decimals: 0 })
      expect(
        CurrencyUtils.minorToMajor(10000000000n, Asset.nativeId().toString('hex'), {
          decimals: 4,
        }),
      ).toEqual({ value: 1n, decimals: 2 })

      expect(
        CurrencyUtils.minorToMajor(1000n, Asset.nativeId().toString('hex'), {
          decimals: 4,
        }),
      ).toEqual({ value: 1n, decimals: -5 })
    })

    it('should return an asset value with 0 decimals by default', () => {
      expect(CurrencyUtils.minorToMajor(1n, assetId)).toEqual({ value: 1n, decimals: 0 })
      expect(CurrencyUtils.minorToMajor(100n, assetId)).toEqual({ value: 1n, decimals: 2 })
      expect(CurrencyUtils.minorToMajor(100n, assetId)).toEqual({ value: 1n, decimals: 2 })
    })

    it('should return an asset value using the given decimals', () => {
      expect(CurrencyUtils.minorToMajor(1n, assetId, { decimals: 2 })).toEqual({
        value: 1n,
        decimals: -2,
      })
      expect(CurrencyUtils.minorToMajor(100n, assetId, { decimals: 2 })).toEqual({
        value: 1n,
        decimals: 0,
      })
      expect(CurrencyUtils.minorToMajor(123n, assetId, { decimals: 2 })).toEqual({
        value: 123n,
        decimals: -2,
      })
    })
  })

  describe('render', () => {
    // Randomly generated custom asset ID
    const assetId = '1a75bf033c1c1925cfcd1a77461364e77c6e861c2a3acabaf9e398e980146651'

    it('should render iron with no extra parameters with 8 decimal places', () => {
      expect(CurrencyUtils.render(0n)).toEqual('0.00000000')
      expect(CurrencyUtils.render(1n)).toEqual('0.00000001')
      expect(CurrencyUtils.render(100n)).toEqual('0.00000100')
      expect(CurrencyUtils.render(10000n)).toEqual('0.00010000')
      expect(CurrencyUtils.render(100000000n)).toEqual('1.00000000')
    })

    it('should include IRON for the iron asset ticker', () => {
      expect(CurrencyUtils.render(1n, true)).toEqual('$IRON 0.00000001')
    })

    it('should still render iron with 8 decimals and $IRON symbol even if parameters are given', () => {
      expect(
        CurrencyUtils.render(1n, false, Asset.nativeId().toString('hex'), {
          decimals: 2,
          symbol: 'FOO',
        }),
      ).toEqual('0.00000001')
      expect(
        CurrencyUtils.render(1n, true, Asset.nativeId().toString('hex'), {
          decimals: 2,
          symbol: 'FOO',
        }),
      ).toEqual('$IRON 0.00000001')
    })

    it('should render an asset value with 0 decimals by default', () => {
      expect(CurrencyUtils.render(1n, false, assetId)).toEqual('1')
      expect(CurrencyUtils.render(1n, true, assetId)).toEqual(`${assetId} 1`)
    })

    it('should render an asset value with the given decimals and symbol', () => {
      expect(CurrencyUtils.render(1n, false, assetId, { decimals: 2 })).toEqual('0.01')
      expect(CurrencyUtils.render(1n, true, assetId, { decimals: 2 })).toEqual(
        `${assetId} 0.01`,
      )

      expect(CurrencyUtils.render(100n, false, assetId, { decimals: 2 })).toEqual('1.00')
      expect(CurrencyUtils.render(100n, true, assetId, { decimals: 2 })).toEqual(
        `${assetId} 1.00`,
      )

      expect(
        CurrencyUtils.render(100n, false, assetId, { decimals: 2, symbol: 'FOO' }),
      ).toEqual('1.00')
      expect(CurrencyUtils.render(100n, true, assetId, { decimals: 2, symbol: 'FOO' })).toEqual(
        `FOO 1.00`,
      )
    })
  })

  it('renderOre', () => {
    expect(CurrencyUtils.renderOre(0n)).toEqual('0')
    expect(CurrencyUtils.renderOre(1n)).toEqual('1')
    expect(CurrencyUtils.renderOre(100n)).toEqual('100')
    expect(CurrencyUtils.renderOre(10000n)).toEqual('10000')
    expect(CurrencyUtils.renderOre(100000000n)).toEqual('100000000')
    expect(CurrencyUtils.renderOre(1n, true)).toEqual('$ORE 1')
  })
})
