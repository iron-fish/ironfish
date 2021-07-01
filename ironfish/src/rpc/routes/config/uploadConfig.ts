/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Config, ConfigOptions, ConfigOptionsSchema } from '../../../fileStores/config'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type UploadConfigRequest = { config: Record<string, unknown> }
export type UploadConfigResponse = Partial<ConfigOptions>

export const UploadConfigRequestSchema: yup.ObjectSchema<UploadConfigRequest> = yup
  .object({ config: yup.mixed().required() })
  .defined()

export const UploadConfigResponseSchema: yup.ObjectSchema<UploadConfigResponse> =
  ConfigOptionsSchema

router.register<typeof UploadConfigRequestSchema, UploadConfigResponse>(
  `${ApiNamespace.config}/uploadConfig`,
  UploadConfigRequestSchema,
  async (request, node): Promise<void> => {
    clearConfig(node.config)

    for (const key of Object.keys(request.data.config)) {
      if (Object.prototype.hasOwnProperty.call(request.data.config, key)) {
        setUnknownConfigValue(node.config, key, request.data.config[key], true)
      }
    }

    await node.config.save()
    request.end()
  },
)

function clearConfig(config: Config): void {
  for (const key of Object.keys(config.loaded)) {
    const configKey = key as keyof ConfigOptions
    delete config.loaded[configKey]
  }
}

export function setUnknownConfigValue(
  config: Config,
  unknownKey: string,
  unknownValue: unknown,
  ignoreUnknownKey = false,
): void {
  if (unknownKey && !(unknownKey in config.defaults)) {
    if (!ignoreUnknownKey) {
      throw new ValidationError(`No config option ${String(unknownKey)}`)
    }
  }

  const sourceKey = unknownKey as keyof ConfigOptions
  let sourceValue = unknownValue

  let targetValue: unknown = config.defaults[sourceKey]
  // Support keys that are undefined inside of the config from old config values or third parties adding config values
  if (targetValue === undefined) {
    targetValue = sourceValue
  }

  let value = sourceValue

  // Trim string values
  if (typeof sourceValue === 'string') {
    sourceValue = sourceValue.trim()
  }

  if (typeof sourceValue !== typeof targetValue) {
    value = convertValue(sourceValue, targetValue)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config.set(sourceKey, value as any)
}

// Expects string in CSV format with no brackets
function stringToStringArray(value: string): string[] | null {
  if (value === '') {
    return []
  }

  // Strip the brackets and split on commas
  const parsedValue = value.split(',')

  // Trim whitespace, trim leading/trailing quotes if necessary
  return parsedValue.map((v) => v.trim())
}

function convertValue(sourceValue: unknown, targetValue: unknown): unknown {
  if (typeof sourceValue !== 'string') {
    throw new ValidationError(
      `Could not convert ${JSON.stringify(sourceValue)} from ${typeof sourceValue} to ${String(
        typeof targetValue,
      )}`,
    )
  }

  let targetType: 'number' | 'boolean' | 'array' | null = null

  if (typeof targetValue === 'number') {
    const converted = Number(sourceValue)
    if (!Number.isNaN(converted)) {
      return converted
    }
    targetType = 'number'
  } else if (typeof targetValue === 'boolean') {
    const value = sourceValue.toLowerCase().trim()
    if (value === '1') {
      return true
    }
    if (value === '0') {
      return false
    }
    if (value === 'true') {
      return true
    }
    if (value === 'false') {
      return false
    }
    targetType = 'boolean'
  } else if (typeof targetValue === 'string') {
    return sourceValue
  } else if (Array.isArray(targetValue)) {
    const result = stringToStringArray(sourceValue.trim())
    if (result !== null) {
      return result
    }
    targetType = 'array'
  }

  throw new ValidationError(
    `Could not convert ${JSON.stringify(sourceValue)} from ${typeof sourceValue} to ${String(
      targetType,
    )}`,
  )
}
