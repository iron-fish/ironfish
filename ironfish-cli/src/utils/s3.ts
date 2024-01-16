/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Readable } from 'stream'
import { CognitoIdentity } from '@aws-sdk/client-cognito-identity'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectCommandOutput,
  GetObjectCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ListObjectsCommand,
  ListObjectsCommandInput,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Credentials } from '@aws-sdk/types/dist-types/credentials'
import { Assert, ErrorUtils, Logger } from '@ironfish/sdk'
import fsAsync from 'fs/promises'
import { pipeline } from 'stream/promises'

// AWS requires that upload parts be at least 5MB
const MINIMUM_MULTIPART_FILE_SIZE = 5 * 1024 * 1024
const MAX_MULTIPART_NUM = 10000

class UploadToBucketError extends Error {
  name = this.constructor.name
  error: unknown

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

const R2_SECRET_NAME = 'r2-prod-access-key'
const R2_ENDPOINT = `https://a93bebf26da4c2fe205f71c896afcf89.r2.cloudflarestorage.com`

export type R2Secret = {
  r2AccessKeyId: string
  r2SecretAccessKey: string
}

async function uploadToBucket(
  s3: S3Client,
  filePath: string,
  contentType: string,
  bucket: string,
  keyName: string,
  logger?: Logger,
  metadata?: Record<string, string>,
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
    Metadata: metadata,
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

async function getPresignedUploadUrl(
  s3: S3Client,
  bucket: string,
  keyName: string,
  expiresInSeconds: number,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: keyName,
  })

  const signedUrl = await getSignedUrl(s3, command, {
    expiresIn: expiresInSeconds,
  })

  return signedUrl
}

/**
 * Returns an HTTPS URL to a file in S3.
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration-getting-started.html
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/dual-stack-endpoints.html
 */
function getDownloadUrl(
  bucket: string,
  key: string,
  region: { accelerated: true } | { accelerated: false; regionCode: string },
  options?: { dualStack?: boolean },
): string {
  const dualStack = options?.dualStack ?? false

  let regionString
  if (region.accelerated) {
    regionString = dualStack ? 's3-accelerate.dualstack' : 's3-accelerate'
  } else {
    regionString = dualStack ? `s3.dualstack.${region.regionCode}` : `s3.${region.regionCode}`
  }

  return `https://${bucket}.${regionString}.amazonaws.com/${key}`
}

async function getObjectMetadata(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<HeadObjectCommandOutput> {
  const command = new HeadObjectCommand({ Bucket: bucket, Key: key })
  const response = await s3.send(command)
  return response
}

async function getBucketObjects(s3: S3Client, bucket: string): Promise<string[]> {
  let truncated = true
  let commandParams: ListObjectsCommandInput = { Bucket: bucket }
  const keys: string[] = []

  while (truncated) {
    const command = new ListObjectsCommand(commandParams)
    const response = await s3.send(command)

    for (const obj of response.Contents || []) {
      if (obj.Key !== undefined) {
        keys.push(obj.Key)
      }
    }

    truncated = response.IsTruncated || false
    commandParams = { Bucket: bucket, Marker: response.Contents?.slice(-1)[0]?.Key }
  }

  return keys
}

async function deleteFromBucket(
  s3Client: S3Client,
  bucket: string,
  fileName: string,
): Promise<DeleteObjectCommandOutput> {
  return s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileName }))
}

function getS3Client(
  useDualstackEndpoint: boolean,
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
  },
): S3Client {
  const region = 'us-east-1'

  if (credentials) {
    return new S3Client({
      useAccelerateEndpoint: true,
      useDualstackEndpoint,
      credentials,
      region,
    })
  }

  return new S3Client({
    useAccelerateEndpoint: true,
    useDualstackEndpoint,
    region,
  })
}

function getR2S3Client(credentials: {
  r2AccessKeyId: string
  r2SecretAccessKey: string
}): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: credentials.r2AccessKeyId,
      secretAccessKey: credentials.r2SecretAccessKey,
    },
  })
}

async function getR2Credentials(region?: string): Promise<R2Secret | undefined> {
  const client = new SecretsManagerClient({ region })
  const command = new GetSecretValueCommand({ SecretId: R2_SECRET_NAME })
  const response = await client.send(command)
  if (response.SecretString === undefined) {
    return
  } else {
    return JSON.parse(response.SecretString) as R2Secret
  }
}

async function getCognitoIdentityCredentials(): Promise<Credentials> {
  const identityPoolId = 'us-east-1:3ebc542a-6ac4-4c5d-9558-1621eadd2382'

  const cognito = new CognitoIdentity({ region: 'us-east-1' })

  const identityResponse = await cognito.getId({ IdentityPoolId: identityPoolId })

  const identityId = identityResponse.IdentityId

  const credentialsResponse = await cognito.getCredentialsForIdentity({
    IdentityId: identityId,
  })

  const cognitoAccessKeyId = credentialsResponse.Credentials?.AccessKeyId
  const cognitoSecretAccessKey = credentialsResponse.Credentials?.SecretKey
  const cognitoSessionToken = credentialsResponse.Credentials?.SessionToken

  Assert.isNotUndefined(cognitoAccessKeyId)
  Assert.isNotUndefined(cognitoSecretAccessKey)
  Assert.isNotUndefined(cognitoSessionToken)

  return {
    accessKeyId: cognitoAccessKeyId,
    secretAccessKey: cognitoSecretAccessKey,
    sessionToken: cognitoSessionToken,
  }
}

export const S3Utils = {
  deleteFromBucket,
  downloadFromBucket,
  getBucketObjects,
  getCognitoIdentityCredentials,
  getDownloadUrl,
  getObjectMetadata,
  getPresignedUploadUrl,
  getR2Credentials,
  getR2S3Client,
  getS3Client,
  uploadToBucket,
}
