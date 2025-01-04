/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TimeUtils } from './time'

describe('TimeUtils', () => {
  describe('renderEstimate', () => {
    it('should render estimates in suitable format', () => {
      expect(TimeUtils.renderEstimate(0, 100, -1)).toEqual('N/A')
      expect(TimeUtils.renderEstimate(50, 100, 60)).toEqual('soon')
      expect(TimeUtils.renderEstimate(50, 100, 20)).toEqual('2s')
      expect(TimeUtils.renderEstimate(50, 200, 1)).toEqual('2m 30s')
      expect(TimeUtils.renderEstimate(10, 10000, 1)).toEqual('2h 46m 30s')
      expect(TimeUtils.renderEstimate(10, 198010, 1)).toEqual('2d 7h')
      expect(TimeUtils.renderEstimate(10, 7689610, 1)).toEqual('2M 29d')
      expect(TimeUtils.renderEstimate(10, 73699210, 1)).toEqual('2y 4M 72h')
    })

    it('should render time spans', () => {
      expect(TimeUtils.renderSpan(0.005)).toEqual('0.005ms')
      expect(TimeUtils.renderSpan(0)).toEqual('0ms')
      expect(TimeUtils.renderSpan(1000)).toEqual('1s')
      expect(TimeUtils.renderSpan(1010)).toEqual('1s 10ms')
      expect(TimeUtils.renderSpan(1150)).toEqual('1s 150ms')
      expect(TimeUtils.renderSpan(330000)).toEqual('5m 30s')
      expect(TimeUtils.renderSpan(7530000)).toEqual('2h 5m')
      expect(TimeUtils.renderSpan(90000000)).toEqual('1d 1h')
      expect(TimeUtils.renderSpan(7775940000)).toEqual('2M 29d')
      expect(TimeUtils.renderSpan(31622400000)).toEqual('1y')
      expect(TimeUtils.renderSpan(71193600000)).toEqual('2y 3M')
    })

    it('should render negative times', () => {
      expect(TimeUtils.renderSpan(-0.005)).toEqual('-0.005ms')
      expect(TimeUtils.renderSpan(-0)).toEqual('0ms')
      expect(TimeUtils.renderSpan(-1000)).toEqual('-1s')
      expect(TimeUtils.renderSpan(-1010)).toEqual('-1s 10ms')
      expect(TimeUtils.renderSpan(-1150)).toEqual('-1s 150ms')
      expect(TimeUtils.renderSpan(-330000)).toEqual('-5m 30s')
      expect(TimeUtils.renderSpan(-7530000)).toEqual('-2h 5m')
      expect(TimeUtils.renderSpan(-90000000)).toEqual('-1d 1h')
      expect(TimeUtils.renderSpan(-7775940000)).toEqual('-2M 29d')
      expect(TimeUtils.renderSpan(-31622400000)).toEqual('-1y')
      expect(TimeUtils.renderSpan(-71193600000)).toEqual('-2y 3M')
    })
  })
})
