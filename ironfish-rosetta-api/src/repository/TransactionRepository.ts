/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { EntityRepository, Like, Repository } from 'typeorm'
import { Transaction } from '../entity'

const FULL_JOINS = ['block']

@EntityRepository(Transaction)
export class TransactionRepository extends Repository<Transaction> {
  async findWithInstances(
    transactionHash?: string,
    blockHash?: string,
  ): Promise<Transaction | null> {
    const transaction = await this.findOne({
      where: {
        hash: transactionHash,
        block: { hash: blockHash },
      },
      relations: FULL_JOINS,
    })
    return transaction || null
  }

  async getWithInstances(transactionHash?: string, blockHash?: string): Promise<Transaction> {
    return await this.findOneOrFail({
      where: {
        hash: transactionHash,
        block: { hash: blockHash },
      },
      relations: FULL_JOINS,
    })
  }

  async findByHashWithInstances(hash: string, limit: number): Promise<Transaction[]> {
    return (
      (await this.find({
        where: { hash: Like(`%${hash}%`) },
        take: limit,
        relations: FULL_JOINS,
      })) || []
    )
  }
}
