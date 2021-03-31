/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Entity, PrimaryColumn, Column } from 'typeorm'

/**
 * Key value store to store informations about the indexer and syncer state
 * */
@Entity()
export class Config {
  @PrimaryColumn()
  key!: string

  @Column()
  value!: string
}
