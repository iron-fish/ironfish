/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import nock from 'nock'
import { NodeFileProvider } from '../fileSystems'
import { AssetsVerificationApi } from './assetsVerificationApi'

const assetData1 = {
  identifier: '0123',
  name: 'Foo',
  symbol: '$FOO',
  decimals: 4,
  logoURI: 'https://example.com/not_real.png',
}

const assetData2 = {
  identifier: 'abcd',
  name: 'Bar',
  symbol: '$BAR',
  decimals: 4,
  logoURI: 'https://example.com/not_real.png',
}

const assetData3 = {
  identifier: 'abcd',
  name: 'Baz',
  symbol: '$BAZ',
  decimals: 4,
  logoURI: 'https://example.com/not_real.png',
}

describe('Assets Verification API Client', () => {
  const files = new NodeFileProvider()

  beforeAll(async () => {
    await files.init()
  })

  beforeEach(() => {
    nock.cleanAll()
  })

  afterEach(() => {
    // eslint-disable-next-line jest/no-standalone-expect
    expect(nock.pendingMocks()).toHaveLength(0)
  })

  describe('getVerifiedAssets', () => {
    it('should return verified assets', async () => {
      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          assets: [assetData1, assetData2],
        })

      const api = new AssetsVerificationApi({
        files,
        url: 'https://test/assets/verified',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assets']).toStrictEqual(
        new Map([
          [assetData1.identifier, assetData1],
          [assetData2.identifier, assetData2],
        ]),
      )
      expect(verifiedAssets.isVerified('0123')).toBe(true)
      expect(verifiedAssets.isVerified('abcd')).toBe(true)
      expect(verifiedAssets.isVerified('4567')).toBe(false)
      expect(verifiedAssets.isVerified('89ef')).toBe(false)
    })

    it('should ignore extra fields in responses', async () => {
      const assetData1Extra = {
        ...assetData1,
        extra: 'should be ignored',
      }

      const assetData2Extra = {
        ...assetData2,
        extra: 'should be ignored',
      }

      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          assets: [assetData1Extra, assetData2Extra],
          extra: 'should be ignored',
        })

      const api = new AssetsVerificationApi({
        files,
        url: 'https://test/assets/verified',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assets']).toStrictEqual(
        new Map([
          [assetData1.identifier, assetData1],
          [assetData2.identifier, assetData2],
        ]),
      )
    })

    it('should refresh verified assets', async () => {
      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          assets: [assetData1, assetData2],
        })
        .get('/assets/verified')
        .reply(200, {
          assets: [assetData3, assetData1],
        })

      const api = new AssetsVerificationApi({
        files,
        url: 'https://test/assets/verified',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assets']).toStrictEqual(
        new Map([
          [assetData1.identifier, assetData1],
          [assetData2.identifier, assetData2],
        ]),
      )

      await api.refreshVerifiedAssets(verifiedAssets)

      expect(verifiedAssets['assets']).toStrictEqual(
        new Map([
          [assetData3.identifier, assetData3],
          [assetData1.identifier, assetData1],
        ]),
      )
    })

    it('should optimize refreshing of verified assets with If-Modified-Since', async () => {
      const lastModified = new Date().toUTCString()
      nock('https://test')
        .get('/assets/verified')
        .reply(
          200,
          {
            assets: [assetData1, assetData2],
          },
          {
            'last-modified': lastModified,
          },
        )
      nock('https://test')
        .matchHeader('if-modified-since', lastModified)
        .get('/assets/verified')
        .reply(304)

      const api = new AssetsVerificationApi({
        files,
        url: 'https://test/assets/verified',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assets']).toStrictEqual(
        new Map([
          [assetData1.identifier, assetData1],
          [assetData2.identifier, assetData2],
        ]),
      )

      await api.refreshVerifiedAssets(verifiedAssets)

      expect(verifiedAssets['assets']).toStrictEqual(
        new Map([
          [assetData1.identifier, assetData1],
          [assetData2.identifier, assetData2],
        ]),
      )
    })

    it('should propagate HTTP errors', async () => {
      nock('https://test').get('/assets/verified').reply(500)

      const api = new AssetsVerificationApi({
        files,
        url: 'https://test/assets/verified',
      })
      await expect(api.getVerifiedAssets()).rejects.toThrow(
        'Request failed with status code 500',
      )
    })

    it('should respect timeouts while establishing connections', async () => {
      nock('https://test')
        .get('/assets/verified')
        .delayConnection(2000)
        .reply(200, {
          assets: [{ identifier: '0123' }, { identifier: 'abcd' }],
        })

      const api = new AssetsVerificationApi({
        files,
        url: 'https://test/assets/verified',
        timeout: 1000,
      })
      await expect(api.getVerifiedAssets()).rejects.toThrow('timeout of 1000ms exceeded')
    })

    it('should respect timeouts while waiting for responses', async () => {
      nock('https://test')
        .get('/assets/verified')
        .delay(2000)
        .reply(200, {
          assets: [{ identifier: '0123' }, { identifier: 'abcd' }],
        })

      const api = new AssetsVerificationApi({
        files,
        url: 'https://test/assets/verified',
        timeout: 1000,
      })
      await expect(api.getVerifiedAssets()).rejects.toThrow('timeout of 1000ms exceeded')
    })

    it('supports file:// URIs', async () => {
      const contents = JSON.stringify({
        assets: [assetData1, assetData2],
      })
      const readFileSpy = jest.spyOn(files, 'readFile').mockResolvedValue(contents)

      const api = new AssetsVerificationApi({
        files,
        url: 'file:///some/where',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assets']).toStrictEqual(
        new Map([
          [assetData1.identifier, assetData1],
          [assetData2.identifier, assetData2],
        ]),
      )
      expect(readFileSpy).toHaveBeenCalledWith('/some/where')
    })
  })
})
