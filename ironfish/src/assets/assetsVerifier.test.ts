/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { SpyInstance } from 'jest-mock'
import nock from 'nock'
import { VerifiedAssetsCacheStore } from '../fileStores/verifiedAssets'
import { NodeFileProvider } from '../fileSystems'
import { AssetsVerifier } from './assetsVerifier'

const apiUrl = 'https://example.com/endpoint'

/* eslint-disable jest/no-standalone-expect */
/* eslint-disable @typescript-eslint/no-explicit-any */
const assetData1 = {
  identifier: '0123',
  symbol: '$FOO',
  decimals: 4,
  logoURI: 'https://example.com/not_real.png',
  website: 'https://example.com/foo',
}

const assetData2 = {
  identifier: '4567',
  symbol: '$BAR',
  decimals: 4,
  logoURI: 'https://example.com/not_real.png',
  website: 'https://example.com/bar',
}

const assetData3 = {
  identifier: '89ab',
  symbol: '$BAZ',
  decimals: 4,
  logoURI: 'https://example.com/not_real.png',
  website: 'https://example.com/baz',
}

describe('AssetsVerifier', () => {
  jest.useFakeTimers()

  const waitForRefreshToFinish = async (refreshSpy: SpyInstance) => {
    for (const result of refreshSpy.mock.results) {
      await result.value
    }
  }

  const files = new NodeFileProvider()

  beforeAll(async () => {
    await files.init()
  })

  beforeEach(() => {
    nock.cleanAll()
    jest.clearAllTimers()
  })

  afterEach(() => {
    expect(nock.pendingMocks()).toHaveLength(0)
  })

  it('does not refresh when not started', () => {
    const assetsVerifier = new AssetsVerifier({ files, apiUrl })
    const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(0)
  })

  it('periodically refreshes once started', async () => {
    nock('https://test')
      .get('/assets/verified_metadata')
      .reply(200, {
        assets: [assetData1],
      })
      .get('/assets/verified_metadata')
      .reply(200, {
        assets: [assetData2],
      })
      .get('/assets/verified_metadata')
      .reply(200, {
        assets: [assetData3],
      })

    const assetsVerifier = new AssetsVerifier({
      files,
      apiUrl: 'https://test/assets/verified_metadata',
    })
    const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

    expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unknown' })
    expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unknown' })
    expect(assetsVerifier.verify('89ab')).toStrictEqual({ status: 'unknown' })

    assetsVerifier.start()
    expect(refresh).toHaveBeenCalledTimes(1)
    await waitForRefreshToFinish(refresh)

    expect(assetsVerifier.verify('0123')).toStrictEqual({
      status: 'verified',
      symbol: assetData1.symbol,
      decimals: assetData1.decimals,
      logoURI: assetData1.logoURI,
      website: assetData1.website,
    })
    expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    expect(assetsVerifier.verify('89ab')).toStrictEqual({ status: 'unverified' })

    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(2)
    await waitForRefreshToFinish(refresh)

    expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unverified' })
    expect(assetsVerifier.verify('4567')).toStrictEqual({
      status: 'verified',
      symbol: assetData2.symbol,
      decimals: assetData2.decimals,
      logoURI: assetData2.logoURI,
      website: assetData2.website,
    })
    expect(assetsVerifier.verify('89ab')).toStrictEqual({ status: 'unverified' })

    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(3)
    await waitForRefreshToFinish(refresh)

    expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unverified' })
    expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    expect(assetsVerifier.verify('89ab')).toStrictEqual({
      status: 'verified',
      symbol: assetData3.symbol,
      decimals: assetData3.decimals,
      logoURI: assetData3.logoURI,
      website: assetData3.website,
    })
  })

  it('does not do any refresh after being stopped', async () => {
    nock('https://test')
      .get('/assets/verified_metadata')
      .reply(200, {
        assets: [assetData1],
      })

    const assetsVerifier = new AssetsVerifier({
      files,
      apiUrl: 'https://test/assets/verified_metadata',
    })
    const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

    assetsVerifier.start()
    expect(refresh).toHaveBeenCalledTimes(1)
    await waitForRefreshToFinish(refresh)

    assetsVerifier.stop()
    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('preserves the in-memory cache after being stopped', async () => {
    nock('https://test')
      .get('/assets/verified_metadata')
      .reply(
        200,
        {
          assets: [assetData2],
        },
        { 'last-modified': 'some-date' },
      )
    nock('https://test')
      .matchHeader('if-modified-since', 'some-date')
      .get('/assets/verified_metadata')
      .reply(304)

    const assetsVerifier = new AssetsVerifier({
      files,
      apiUrl: 'https://test/assets/verified_metadata',
    })
    const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

    assetsVerifier.start()
    expect(refresh).toHaveBeenCalledTimes(1)
    await waitForRefreshToFinish(refresh)

    assetsVerifier.stop()
    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(1)

    assetsVerifier.start()
    expect(refresh).toHaveBeenCalledTimes(2)
    await waitForRefreshToFinish(refresh)
  })

  describe('verify', () => {
    it("returns 'unknown' when not started", () => {
      const assetsVerifier = new AssetsVerifier({ files, apiUrl })

      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unknown' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unknown' })
    })

    it("returns 'unknown' when the API is unreachable", async () => {
      nock('https://test').get('/assets/verified_metadata').reply(500)

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://test/assets/verified_metadata',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')
      const warn = jest.spyOn(assetsVerifier['logger'], 'warn')

      assetsVerifier.start()
      await expect(waitForRefreshToFinish(refresh)).rejects.toThrow()

      expect(warn).toHaveBeenCalledWith(
        'Error while fetching verified assets: Request failed with status code 500',
      )
      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unknown' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unknown' })
    })

    it("returns 'verified' when the API lists the given asset", async () => {
      nock('https://test')
        .get('/assets/verified_metadata')
        .reply(200, {
          assets: [assetData1],
        })

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://test/assets/verified_metadata',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(assetsVerifier.verify('0123')).toStrictEqual({
        status: 'verified',
        symbol: assetData1.symbol,
        decimals: assetData1.decimals,
        logoURI: assetData1.logoURI,
        website: assetData1.website,
      })
    })

    it("returns 'unverified' when the API does not list the asset", async () => {
      nock('https://test')
        .get('/assets/verified_metadata')
        .reply(200, {
          assets: [assetData1],
        })

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://test/assets/verified_metadata',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    })

    it('uses the in-memory cache when the API is unreachable', async () => {
      nock('https://test')
        .get('/assets/verified_metadata')
        .reply(200, {
          assets: [assetData1],
        })
        .get('/assets/verified_metadata')
        .reply(500)

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://test/assets/verified_metadata',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')
      const warn = jest.spyOn(assetsVerifier['logger'], 'warn')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(warn).not.toHaveBeenCalled()
      expect(assetsVerifier.verify('0123')).toStrictEqual({
        status: 'verified',
        symbol: assetData1.symbol,
        decimals: assetData1.decimals,
        logoURI: assetData1.logoURI,
        website: assetData1.website,
      })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })

      jest.runOnlyPendingTimers()
      await expect(waitForRefreshToFinish(refresh)).rejects.toThrow()

      expect(warn).toHaveBeenCalledWith(
        'Error while fetching verified assets: Request failed with status code 500',
      )
      expect(assetsVerifier.verify('0123')).toStrictEqual({
        status: 'verified',
        symbol: assetData1.symbol,
        decimals: assetData1.decimals,
        logoURI: assetData1.logoURI,
        website: assetData1.website,
      })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    })

    it('uses the in-memory cache after being stopped', async () => {
      nock('https://test')
        .get('/assets/verified_metadata')
        .reply(200, {
          assets: [assetData1],
        })

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://test/assets/verified_metadata',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(assetsVerifier.verify('0123')).toStrictEqual({
        status: 'verified',
        symbol: assetData1.symbol,
        decimals: assetData1.decimals,
        logoURI: assetData1.logoURI,
        website: assetData1.website,
      })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })

      assetsVerifier.stop()

      expect(assetsVerifier.verify('0123')).toStrictEqual({
        status: 'verified',
        symbol: assetData1.symbol,
        decimals: assetData1.decimals,
        logoURI: assetData1.logoURI,
        website: assetData1.website,
      })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    })
  })

  describe('with persistent cache', () => {
    it('returns data from persistent cache', async () => {
      const cache = Object.create(
        VerifiedAssetsCacheStore.prototype,
      ) as VerifiedAssetsCacheStore
      jest.spyOn(cache, 'setMany').mockReturnValue(undefined)
      jest.spyOn(cache, 'save').mockResolvedValue(undefined)
      cache.config = {
        apiUrl: 'https://test/assets/verified_metadata',
        assets: [assetData1],
      }

      nock('https://test')
        .get('/assets/verified_metadata')
        .reply(200, {
          assets: [assetData2],
        })

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://test/assets/verified_metadata',
        cache: cache,
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()

      expect(assetsVerifier.verify('0123')).toStrictEqual({
        status: 'verified',
        symbol: assetData1.symbol,
        decimals: assetData1.decimals,
        logoURI: assetData1.logoURI,
        website: assetData1.website,
      })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })

      await waitForRefreshToFinish(refresh)
    })

    it('ignores persistent cache if API url does not match', async () => {
      const cache = Object.create(
        VerifiedAssetsCacheStore.prototype,
      ) as VerifiedAssetsCacheStore
      jest.spyOn(cache, 'setMany').mockReturnValue(undefined)
      jest.spyOn(cache, 'save').mockResolvedValue(undefined)
      cache.config = {
        apiUrl: 'https://foo.test/assets/verified_metadata',
        assets: [assetData1],
      }

      nock('https://bar.test')
        .get('/assets/verified_metadata')
        .reply(200, {
          assets: [assetData2],
        })

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://bar.test/assets/verified_metadata',
        cache: cache,
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()

      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unknown' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unknown' })

      await waitForRefreshToFinish(refresh)

      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unverified' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({
        status: 'verified',
        symbol: assetData2.symbol,
        decimals: assetData2.decimals,
        logoURI: assetData2.logoURI,
        website: assetData2.website,
      })
    })

    it('saves the persistent cache after every update', async () => {
      const cache = Object.create(VerifiedAssetsCacheStore.prototype)
      const setManySpy = jest.spyOn(cache, 'setMany').mockReturnValue(undefined)
      const saveSpy = jest.spyOn(cache, 'save').mockResolvedValue(undefined)

      nock('https://test')
        .get('/assets/verified_metadata')
        .reply(200, {
          assets: [assetData1],
        })
        .get('/assets/verified_metadata')
        .reply(
          200,
          {
            assets: [assetData2],
          },
          { 'last-modified': 'some-date' },
        )

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://test/assets/verified_metadata',
        cache: cache,
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(setManySpy).toHaveBeenCalledWith({
        apiUrl: 'https://test/assets/verified_metadata',
        assets: [assetData1],
        lastModified: undefined,
      })
      expect(saveSpy).toHaveBeenCalledTimes(1)

      jest.runOnlyPendingTimers()
      await waitForRefreshToFinish(refresh)

      expect(setManySpy).toHaveBeenCalledWith({
        apiUrl: 'https://test/assets/verified_metadata',
        assets: [assetData2],
        lastModified: 'some-date',
      })
      expect(saveSpy).toHaveBeenCalledTimes(2)
    })

    it('does not save the persistent cache after when not modified', async () => {
      const cache = Object.create(
        VerifiedAssetsCacheStore.prototype,
      ) as VerifiedAssetsCacheStore
      cache.config = {
        apiUrl: 'https://test/assets/verified_metadata',
        assets: [assetData1],
        lastModified: 'some-date',
      }
      const setManySpy = jest.spyOn(cache, 'setMany').mockReturnValue(undefined)
      const saveSpy = jest.spyOn(cache, 'save').mockResolvedValue(undefined)

      nock('https://test')
        .matchHeader('if-modified-since', 'some-date')
        .get('/assets/verified_metadata')
        .reply(304)

      const assetsVerifier = new AssetsVerifier({
        files,
        apiUrl: 'https://test/assets/verified_metadata',
        cache: cache,
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()

      expect(assetsVerifier.verify('0123')).toStrictEqual({
        status: 'verified',
        symbol: assetData1.symbol,
        decimals: assetData1.decimals,
        logoURI: assetData1.logoURI,
        website: assetData1.website,
      })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })

      await waitForRefreshToFinish(refresh)

      expect(assetsVerifier.verify('0123')).toStrictEqual({
        status: 'verified',
        symbol: assetData1.symbol,
        decimals: assetData1.decimals,
        logoURI: assetData1.logoURI,
        website: assetData1.website,
      })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
      expect(setManySpy).not.toHaveBeenCalled()
      expect(saveSpy).not.toHaveBeenCalled()
    })
  })
})
