/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getDownloadUrl } from './s3'

describe('S3Utils', () => {
  describe('getDownloadUrl', () => {
    it('Should return non-accelerated non-dualstack URL', () => {
      expect(
        getDownloadUrl('DOC-EXAMPLE-BUCKET1', 'puppy.png', {
          accelerated: false,
          regionCode: 'us-west-2',
        }),
      ).toEqual('https://DOC-EXAMPLE-BUCKET1.s3.us-west-2.amazonaws.com/puppy.png')
    })

    it('Should return non-accelerated dualstack URL', () => {
      expect(
        getDownloadUrl(
          'DOC-EXAMPLE-BUCKET1',
          'puppy.png',
          {
            accelerated: false,
            regionCode: 'us-west-2',
          },
          { dualStack: true },
        ),
      ).toEqual('https://DOC-EXAMPLE-BUCKET1.s3.dualstack.us-west-2.amazonaws.com/puppy.png')
    })

    it('Should return accelerated URL', () => {
      expect(
        getDownloadUrl('DOC-EXAMPLE-BUCKET1', 'puppy.png', {
          accelerated: true,
        }),
      ).toEqual('https://DOC-EXAMPLE-BUCKET1.s3-accelerate.amazonaws.com/puppy.png')
    })

    it('Should return accelerated dualstack URL', () => {
      expect(
        getDownloadUrl(
          'DOC-EXAMPLE-BUCKET1',
          'puppy.png',
          {
            accelerated: true,
          },
          { dualStack: true },
        ),
      ).toEqual('https://DOC-EXAMPLE-BUCKET1.s3-accelerate.dualstack.amazonaws.com/puppy.png')
    })
  })
})
