/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect as expectCli, test } from '@oclif/test'
import path from 'path'

describe('service:snapshot', () => {
  jest.spyOn(Date, 'now').mockReturnValue(123456789)
  const mockedFileSize = 10000

  const manifestContent = {
    block_height: 3,
    checksum: Buffer.from('foo').toString('hex'),
    file_name: `ironfish_snapshot_${Date.now()}.tar.gz`,
    file_size: mockedFileSize,
    timestamp: Date.now(),
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')

      const response = {
        contentStream: jest.fn(async function* () {
          const stream = [
            { start: 1, stop: 3 },
            { start: 1, stop: 3, seq: 3, buffer: Buffer.from('foo') },
          ]

          for await (const value of stream) {
            yield value
          }
        }),
      }

      const client = {
        connect: jest.fn(),
        snapshotChainStream: jest.fn().mockReturnValue(response),
      }

      const mockFileSystem = {
        mkdir: jest.fn(),
        resolve: jest.fn().mockImplementation((path: string) => path),
        join: jest.fn().mockImplementation((...paths: string[]) => path.join(...paths)),
      }

      const module: typeof jest = {
        ...originalModule,
        IronfishSdk: {
          init: jest.fn().mockReturnValue({
            connectRpc: jest.fn().mockResolvedValue(client),
            client,
            fileSystem: mockFileSystem,
          }),
          response,
        },
      }

      return module
    })

    jest.mock('@aws-sdk/client-s3', () => {
      const mockS3Client = {
        send: jest
          .fn()
          .mockReturnValue(Promise.resolve({ ETag: 'barbaz' }))
          .mockReturnValueOnce(Promise.resolve({ UploadId: 'foobar' })),
      }

      return {
        S3Client: jest.fn(() => mockS3Client),
        AbortMultipartUploadCommand: jest.fn(),
        CompleteMultipartUploadCommand: jest.fn(),
        CreateMultipartUploadCommand: jest.fn(),
        UploadPartCommand: jest.fn(),
      }
    })

    jest.mock('tar', () => {
      return { create: jest.fn() }
    })

    jest.mock('crypto', () => {
      const mockHasher = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(Buffer.from('foo')),
      }
      return { createHash: jest.fn(() => mockHasher), Hash: jest.fn(() => mockHasher) }
    })

    jest.mock('fs/promises', () => {
      const mockFileHandle = {
        createReadStream: jest.fn().mockReturnValue(['test']),
      }

      const mockStats = {
        size: mockedFileSize,
      }

      return {
        open: jest.fn().mockReturnValue(mockFileHandle),
        writeFile: jest.fn(() => Promise.resolve()),
        mkdtemp: jest.fn().mockReturnValue('testtempdir/'),
        FileHandle: jest.fn(() => mockFileHandle),
        stat: jest.fn(() => mockStats),
      }
    })
  })

  afterAll(() => {
    jest.dontMock('@ironfish/sdk')
  })

  describe('given a bucket, exports a snapshot of the chain and uploads it', () => {
    test
      .stdout()
      .command(['service:snapshot', '--bucket=testbucket'])
      .exit(0)
      .it('outputs the contents of manifest.json', (ctx) => {
        expectCli(ctx.stdout).include(JSON.stringify(manifestContent, undefined, '  '))
      })
  })

  describe('given a path, exports a snapshot of the chain to that path', () => {
    test
      .stdout()
      .command(['service:snapshot', '--path=foobar'])
      .exit(0)
      .it('exports blocks and snapshot to correct path', (ctx) => {
        expectCli(ctx.stdout).include(
          `Zipping\n    SRC foobar/blocks\n    DST foobar/${manifestContent.file_name}\n\n`,
        )
      })
  })

  describe('given a path and bucket, exports a snapshot of the chain to that path and uploads it', () => {
    test
      .stdout()
      .command(['service:snapshot', '--path=foobar', '--bucket=testbucket'])
      .exit(0)
      .it(
        'exports blocks and snapshot to correct path, and outputs the contents of manifest.json',
        (ctx) => {
          expectCli(ctx.stdout).include(
            `Zipping\n    SRC foobar/blocks\n    DST foobar/${manifestContent.file_name}\n\n`,
          )
          expectCli(ctx.stdout).include(JSON.stringify(manifestContent, undefined, '  '))
        },
      )
  })
})
