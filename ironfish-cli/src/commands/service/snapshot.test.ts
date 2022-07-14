/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect as expectCli, test } from '@oclif/test'
import path from 'path'
import { Readable } from 'stream'

describe('service:snapshot', () => {
  jest.spyOn(Date, 'now').mockReturnValue(123456789)
  const mockedFileSize = 10 * 1024 * 1024

  const manifestContent = {
    block_height: 3,
    checksum: 'e5b844cc57f57094ea4585e235f36c78c1cd222262bb89d53c94dcb4d6b3e55d',
    file_name: `ironfish_snapshot_123456789.tar.gz`,
    file_size: mockedFileSize,
    timestamp: 123456789,
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
          .mockReturnValue(Promise.resolve({ UploadId: 'foobar', ETag: 'barbaz' })),
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

    jest.mock('fs/promises', () => {
      const mockFileHandle = {
        createReadStream: jest
          .fn()
          .mockImplementation(() => Readable.from(Buffer.alloc(10 * 1024 * 1024))),
      }

      const mockStats = {
        size: mockedFileSize,
      }

      return {
        FileHandle: jest.fn(() => mockFileHandle),
        open: jest.fn().mockReturnValue(Promise.resolve(mockFileHandle)),
        mkdir: jest.fn().mockImplementation((tempdir: string) => tempdir),
        rm: jest.fn(),
        rmdir: jest.fn(),
        stat: jest.fn(() => mockStats),
        writeFile: jest.fn(() => Promise.resolve()),
      }
    })
  })

  afterAll(() => {
    jest.dontMock('@ironfish/sdk')
  })

  describe('given the upload flag, exports a snapshot of the chain and uploads it', () => {
    test
      .stdout()
      .command(['service:snapshot', '--upload'])
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

  describe('given the upload flag and bucket, exports a snapshot of the chain to that path and uploads it', () => {
    test
      .stdout()
      .command(['service:snapshot', '--upload', '--path=foobar'])
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
