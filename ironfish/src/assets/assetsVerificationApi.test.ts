/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fs from 'fs'
import nock from 'nock'
import { AssetsVerificationApi } from './assetsVerificationApi'

describe('Assets Verification API Client', () => {
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
          data: [{ identifier: '0123' }, { identifier: 'abcd' }],
        })

      const api = new AssetsVerificationApi({
        url: 'https://test/assets/verified',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assetIds']).toStrictEqual(new Set(['0123', 'abcd']))
      expect(verifiedAssets.isVerified('0123')).toBe(true)
      expect(verifiedAssets.isVerified('abcd')).toBe(true)
      expect(verifiedAssets.isVerified('4567')).toBe(false)
      expect(verifiedAssets.isVerified('89ef')).toBe(false)
    })

    it('should ignore extra fields in responses', async () => {
      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          data: [
            { identifier: '0123', extra: 'should be ignored' },
            { identifier: 'abcd', extra: 'should be ignored' },
          ],
          extra: 'should be ignored',
        })

      const api = new AssetsVerificationApi({
        url: 'https://test/assets/verified',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assetIds']).toStrictEqual(new Set(['0123', 'abcd']))
    })

    it('should refresh verified assets', async () => {
      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          data: [{ identifier: '0123' }, { identifier: 'abcd' }],
        })
        .get('/assets/verified')
        .reply(200, {
          data: [{ identifier: '4567' }, { identifier: '0123' }],
        })

      const api = new AssetsVerificationApi({
        url: 'https://test/assets/verified',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assetIds']).toStrictEqual(new Set(['0123', 'abcd']))

      await api.refreshVerifiedAssets(verifiedAssets)

      expect(verifiedAssets['assetIds']).toStrictEqual(new Set(['0123', '4567']))
    })

    it('should optimize refreshing of verified assets with If-Modified-Since', async () => {
      const lastModified = new Date().toUTCString()
      nock('https://test')
        .get('/assets/verified')
        .reply(
          200,
          {
            data: [{ identifier: '0123' }, { identifier: 'abcd' }],
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
        url: 'https://test/assets/verified',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assetIds']).toStrictEqual(new Set(['0123', 'abcd']))

      await api.refreshVerifiedAssets(verifiedAssets)

      expect(verifiedAssets['assetIds']).toStrictEqual(new Set(['0123', 'abcd']))
    })

    it('should propagate HTTP errors', async () => {
      nock('https://test').get('/assets/verified').reply(500)

      const api = new AssetsVerificationApi({
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
          data: [{ identifier: '0123' }, { identifier: 'abcd' }],
        })

      const api = new AssetsVerificationApi({
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
          data: [{ identifier: '0123' }, { identifier: 'abcd' }],
        })

      const api = new AssetsVerificationApi({
        url: 'https://test/assets/verified',
        timeout: 1000,
      })
      await expect(api.getVerifiedAssets()).rejects.toThrow('timeout of 1000ms exceeded')
    })

    it('supports file:// URIs', async () => {
      const contents = JSON.stringify({
        data: [{ identifier: '0123' }, { identifier: 'abcd' }],
      })
      const readFileSpy = jest.spyOn(fs.promises, 'readFile').mockResolvedValue(contents)

      const api = new AssetsVerificationApi({
        url: 'file:///some/where',
      })
      const verifiedAssets = await api.getVerifiedAssets()

      expect(verifiedAssets['assetIds']).toStrictEqual(new Set(['0123', 'abcd']))
      expect(readFileSpy).toHaveBeenCalledWith('/some/where', { encoding: 'utf8' })
    })
  })
})
