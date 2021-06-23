/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Column, Entity, Index, ManyToOne, PrimaryColumn } from 'typeorm'
import { Block } from './Block'
import { Hash, Timestamp } from './SharedColumnType'
import { bigint } from './ValueTransformer'

export interface Note {
  commitment: string
}

export interface Spend {
  nullifier: string
}

@Entity()
export class Transaction {
  @PrimaryColumn(Hash)
  hash!: string

  @Column({
    type: 'bigint',
    transformer: bigint,
  })
  fee!: number

  @Column()
  size!: number

  @Column(Timestamp)
  timestamp!: number

  @Index()
  @ManyToOne(() => Block, (block) => block.transactions, { onDelete: 'CASCADE' })
  block!: Block

  @Column('jsonb')
  notes!: Note[]

  @Column('jsonb')
  spends!: Spend[]
}
