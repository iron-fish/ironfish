/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Event } from '../event'
import { FileSystem } from '../fileSystems'
import { PartialRecursive, YupUtils } from '../utils'
import { FileStore } from './fileStore'

export class KeyStore<TSchema extends Record<string, unknown>> {
  dataDir: string
  files: FileSystem
  storage: FileStore<TSchema>
  config: Readonly<TSchema>
  defaults: TSchema
  loaded: Partial<TSchema>
  overrides: Partial<TSchema> = {}
  keysLoaded = new Set<keyof TSchema>()
  schema: yup.ObjectSchema<Partial<TSchema>> | undefined

  readonly onConfigChange: Event<[key: keyof TSchema, value: TSchema[keyof TSchema]]> =
    new Event()

  constructor(
    files: FileSystem,
    configName: string,
    defaults: TSchema,
    dataDir?: string,
    schema?: yup.ObjectSchema<TSchema | Partial<TSchema>>,
  ) {
    this.files = files
    this.storage = new FileStore<TSchema>(files, configName, dataDir)
    this.schema = schema
    this.dataDir = this.storage.dataDir

    const loaded = Object.setPrototypeOf({}, defaults) as TSchema
    const overrides = Object.setPrototypeOf({}, loaded) as TSchema
    const config = Object.setPrototypeOf({}, overrides) as TSchema

    this.defaults = defaults
    this.loaded = loaded
    this.overrides = overrides
    this.config = config
  }

  async load(): Promise<void> {
    const data = await this.storage.load()

    // Validate file store if we have a schema
    if (this.schema) {
      const { error } = await YupUtils.tryValidate(this.schema, data)
      if (error) {
        throw new Error(error.message)
      }
    }

    this.keysLoaded.clear()

    if (data !== null) {
      let key: keyof TSchema

      for (key in data) {
        this.keysLoaded.add(key)
      }
    }

    this.loaded = { ...data } as Partial<TSchema>

    //  Patch back in inheritence so config is still TSchema
    Object.setPrototypeOf(this.loaded, this.defaults)
    Object.setPrototypeOf(this.overrides, this.loaded)

    // Write the file out if it doesnt exist
    if (data === null) {
      await this.save()
    }
  }

  async save(): Promise<void> {
    const save: PartialRecursive<TSchema> = {}

    let key: keyof TSchema
    for (key in this.loaded) {
      const shouldSaveKey = this.keysLoaded.has(key) || this.loaded[key] !== this.defaults[key]

      if (shouldSaveKey) {
        Object.assign(save, { [key]: this.config[key] })
      }
    }

    await this.storage.save(save)
  }

  set<T extends keyof TSchema>(key: T, value: TSchema[T]): void {
    const previousValue = this.config[key]

    Object.assign(this.loaded, { [key]: value })

    if (Object.prototype.hasOwnProperty.call(this.overrides, key)) {
      delete this.overrides[key]
    }

    if (previousValue !== value) {
      this.onConfigChange.emit(key, value)
    }
  }

  setOverride<T extends keyof TSchema>(key: T, value: TSchema[T]): void {
    const previousValue = this.config[key]

    Object.assign(this.overrides, { [key]: value })

    if (previousValue !== value) {
      this.onConfigChange.emit(key, value)
    }
  }

  get<T extends keyof TSchema>(key: T): TSchema[T] {
    return this.config[key]
  }

  getArray<T extends keyof TSchema>(key: T): TSchema[T] {
    const value = this.get(key)

    if (Array.isArray(value)) {
      return value
    }

    if (typeof value !== 'string') {
      throw new Error(`${String(key)} must be array or string`)
    }

    return value.split(',').filter(Boolean) as TSchema[T]
  }
}
