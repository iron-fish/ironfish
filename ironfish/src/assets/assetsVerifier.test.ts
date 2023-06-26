/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import nock from 'nock'
import { AssetsVerifier } from './assetsVerifier'

/* eslint-disable jest/no-standalone-expect */
/* eslint-disable @typescript-eslint/no-explicit-any */

describe('AssetsVerifier', () => {
  jest.useFakeTimers()

  const waitForRefreshToFinish = async (refreshSpy: jest.SpyInstance) => {
    for (const result of refreshSpy.mock.results) {
      await result.value
    }
  }

  beforeEach(() => {
    nock.cleanAll()
    jest.clearAllTimers()
  })

  afterEach(() => {
    expect(nock.pendingMocks()).toHaveLength(0)
  })

  it('does not refresh when not started', () => {
    const assetsVerifier = new AssetsVerifier()
    const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(0)
  })

  it('periodically refreshes once started', async () => {
    nock('https://test')
      .get('/assets/verified')
      .reply(200, {
        data: [{ identifier: '0123' }],
      })
      .get('/assets/verified')
      .reply(200, {
        data: [{ identifier: '4567' }],
      })
      .get('/assets/verified')
      .reply(200, {
        data: [{ identifier: '89ab' }],
      })

    const assetsVerifier = new AssetsVerifier({
      apiUrl: 'https://test/assets/verified',
    })
    const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

    expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unknown' })
    expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unknown' })
    expect(assetsVerifier.verify('89ab')).toStrictEqual({ status: 'unknown' })

    assetsVerifier.start()
    expect(refresh).toHaveBeenCalledTimes(1)
    await waitForRefreshToFinish(refresh)

    expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'verified' })
    expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    expect(assetsVerifier.verify('89ab')).toStrictEqual({ status: 'unverified' })

    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(2)
    await waitForRefreshToFinish(refresh)

    expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unverified' })
    expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'verified' })
    expect(assetsVerifier.verify('89ab')).toStrictEqual({ status: 'unverified' })

    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(3)
    await waitForRefreshToFinish(refresh)

    expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unverified' })
    expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    expect(assetsVerifier.verify('89ab')).toStrictEqual({ status: 'verified' })
  })

  it('does not do any refresh after being stopped', async () => {
    nock('https://test')
      .get('/assets/verified')
      .reply(200, {
        data: [{ identifier: '0123' }],
      })

    const assetsVerifier = new AssetsVerifier({
      apiUrl: 'https://test/assets/verified',
    })
    const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

    assetsVerifier.start()
    expect(refresh).toHaveBeenCalledTimes(1)
    await waitForRefreshToFinish(refresh)

    assetsVerifier.stop()
    jest.runOnlyPendingTimers()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('preserves cache after being stopped', async () => {
    nock('https://test')
      .get('/assets/verified')
      .reply(
        200,
        {
          data: [{ identifier: '0123' }],
        },
        { 'last-modified': 'some-date' },
      )
    nock('https://test')
      .matchHeader('if-modified-since', 'some-date')
      .get('/assets/verified')
      .reply(304)

    const assetsVerifier = new AssetsVerifier({
      apiUrl: 'https://test/assets/verified',
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
      const assetsVerifier = new AssetsVerifier()

      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unknown' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unknown' })
    })

    it("returns 'unknown' after being stopped", async () => {
      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          data: [{ identifier: '0123' }],
        })

      const assetsVerifier = new AssetsVerifier({
        apiUrl: 'https://test/assets/verified',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'verified' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })

      assetsVerifier.stop()

      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unknown' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unknown' })
    })

    it("returns 'unknown' when the API is unreachable", async () => {
      nock('https://test').get('/assets/verified').reply(500)

      const assetsVerifier = new AssetsVerifier({
        apiUrl: 'https://test/assets/verified',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')
      const error = jest.spyOn(assetsVerifier['logger'], 'error')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(error).toHaveBeenCalledWith(
        'Error while fetching verified assets: Request failed with status code 500',
      )
      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'unknown' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unknown' })
    })

    it("returns 'verified' when the API lists the given asset", async () => {
      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          data: [{ identifier: '0123' }],
        })

      const assetsVerifier = new AssetsVerifier({
        apiUrl: 'https://test/assets/verified',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'verified' })
    })

    it("returns 'unverified' when the API does not list the asset", async () => {
      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          data: [{ identifier: '0123' }],
        })

      const assetsVerifier = new AssetsVerifier({
        apiUrl: 'https://test/assets/verified',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    })

    it('uses the cache when the API is unreachable', async () => {
      nock('https://test')
        .get('/assets/verified')
        .reply(200, {
          data: [{ identifier: '0123' }],
        })
        .get('/assets/verified')
        .reply(500)

      const assetsVerifier = new AssetsVerifier({
        apiUrl: 'https://test/assets/verified',
      })
      const refresh = jest.spyOn(assetsVerifier as any, 'refresh')
      const error = jest.spyOn(assetsVerifier['logger'], 'error')

      assetsVerifier.start()
      await waitForRefreshToFinish(refresh)

      expect(error).not.toHaveBeenCalled()
      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'verified' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })

      jest.runOnlyPendingTimers()
      await waitForRefreshToFinish(refresh)

      expect(error).toHaveBeenCalledWith(
        'Error while fetching verified assets: Request failed with status code 500',
      )
      expect(assetsVerifier.verify('0123')).toStrictEqual({ status: 'verified' })
      expect(assetsVerifier.verify('4567')).toStrictEqual({ status: 'unverified' })
    })
  })
})
