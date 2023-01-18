/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Readable } from 'stream'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { Assert, ErrorUtils, Logger } from '@ironfish/sdk'
import fsAsync from 'fs/promises'
import { pipeline } from 'stream/promises'

// AWS requires that upload parts be at least 5MB
const MINIMUM_MULTIPART_FILE_SIZE = 5 * 1024 * 1024
const MAX_MULTIPART_NUM = 10000

class UploadToBucketError extends Error {
  name = this.constructor.name
  error: unknown | undefined

  constructor(message?: string, error?: unknown) {
    super(message)
    this.error = error
  }
}
class CreateMultipartError extends UploadToBucketError {}
class UploadMultipartError extends UploadToBucketError {}
class UploadLastMultipartError extends UploadToBucketError {}
class UploadReadFileError extends UploadToBucketError {}
class UploadFailedError extends UploadToBucketError {}

async function uploadToBucket(
  s3: S3Client,
  filePath: string,
  contentType: string,
  bucket: string,
  keyName: string,
  logger?: Logger,
): Promise<void> {
  const fileHandle = await fsAsync.open(filePath, 'r')

  const stat = await fsAsync.stat(filePath)
  const fileSize = stat.size
  let numParts = MAX_MULTIPART_NUM

  while (fileSize / numParts < MINIMUM_MULTIPART_FILE_SIZE) {
    numParts /= 2
  }

  const uploadChunkSize = fileSize / numParts

  const contentStream = fileHandle.createReadStream()

  const params = {
    Bucket: bucket,
    Key: keyName,
    ContentType: contentType,
  }

  const uploadId = await s3
    .send(new CreateMultipartUploadCommand(params))
    .then((result) => result.UploadId)
    .catch((err: Error) => {
      logger?.debug(`Could not create multipart upload to S3: ${err.message}`)
      throw new CreateMultipartError(`Could not create multipart upload to S3`, err)
    })

  Assert.isNotUndefined(uploadId)

  const uploadPartsPromise = new Promise<{
    Parts: { ETag: string | undefined; PartNumber: number }[]
  }>((resolve, reject) => {
    const partMap: { Parts: { ETag: string | undefined; PartNumber: number }[] } = {
      Parts: [],
    }

    let partNum = 1
    let acc: Buffer | null = null

    contentStream.on('data', (chunk: Buffer) => {
      if (!acc) {
        acc = chunk
      } else {
        acc = Buffer.concat([acc, chunk])
      }

      if (acc.length > uploadChunkSize) {
        contentStream.pause()

        const params = {
          Bucket: bucket,
          Key: keyName,
          PartNumber: partNum,
          UploadId: uploadId,
          ContentType: contentType,
          Body: acc,
        }

        s3.send(new UploadPartCommand(params))
          .then((result) => {
            partMap.Parts.push({ ETag: result.ETag, PartNumber: params.PartNumber })
            partNum += 1
            acc = null
            contentStream.resume()
          })
          .catch((err) => {
            logger?.debug(`Could not upload part to S3 bucket: ${ErrorUtils.renderError(err)}`)
            reject(new UploadMultipartError('Could not upload part to S3 bucket', err))
          })
      }
    })

    contentStream.on('close', () => {
      if (acc) {
        const params = {
          Bucket: bucket,
          Key: keyName,
          PartNumber: partNum,
          UploadId: uploadId,
          ContentType: contentType,
          Body: acc,
        }

        s3.send(new UploadPartCommand(params))
          .then((result) => {
            partMap.Parts.push({ ETag: result.ETag, PartNumber: params.PartNumber })
            acc = null
            resolve(partMap)
          })
          .catch((err) => {
            logger?.debug(
              `Could not upload last part to S3 bucket: ${ErrorUtils.renderError(err)}`,
            )
            reject(new UploadLastMultipartError('Could not upload last part to S3 bucket', err))
          })
      }
    })

    contentStream.on('error', (err) => {
      logger?.debug(`Could not read file: ${err.message}; aborting upload to S3...`)

      const params = {
        Bucket: bucket,
        Key: keyName,
        UploadId: uploadId,
      }

      void s3
        .send(new AbortMultipartUploadCommand(params))
        .then()
        .catch(() => {
          // Ignore error
        })

      reject(new UploadReadFileError(undefined, err))
    })
  })

  const partMap = await uploadPartsPromise

  logger?.debug(
    `All parts of snapshot have been uploaded. Finalizing multipart upload. Parts: ${partMap.Parts.length}`,
  )

  const completionParams = {
    Bucket: bucket,
    Key: keyName,
    UploadId: uploadId,
    MultipartUpload: partMap,
  }

  await s3
    .send(new CompleteMultipartUploadCommand(completionParams))
    .then(() => {
      logger?.debug(`Multipart upload complete.`)
    })
    .catch((err) => {
      throw new UploadFailedError('Could not complete multipart S3 upload', err)
    })
}

async function downloadFromBucket(
  s3: S3Client,
  bucket: string,
  keyName: string,
  output: string,
): Promise<void> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: keyName })
  const response = await s3.send(command)
  if (response.Body) {
    const fileHandle = await fsAsync.open(output, 'w')
    const ws = fileHandle.createWriteStream()

    await pipeline(response.Body as Readable, ws)

    ws.close()
    await fileHandle.close()
  }
}

export const S3Utils = { downloadFromBucket, uploadToBucket }
