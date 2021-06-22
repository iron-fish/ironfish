/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm'
import { Hash, Timestamp } from './SharedColumnType'
import { Transaction } from './Transaction'
import { bigint } from './ValueTransformer'

@Entity()
export class Block {
  @PrimaryColumn(Hash)
  hash!: string

  @Index()
  @Column({
    type: 'bigint',
    transformer: bigint,
  })
  sequence!: number

  @Column()
  previousBlockHash!: string
  previousBlock?: Block

  @Column()
  difficulty!: number

  @Column()
  size!: number

  @Column(Timestamp)
  timestamp!: number

  @Column()
  transactionsCount!: number

  @OneToMany(() => Transaction, (transaction) => transaction.block)
  transactions!: Transaction[]
}
