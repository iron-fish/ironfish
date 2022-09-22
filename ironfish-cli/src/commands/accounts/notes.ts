/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { oreToIron } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

type Note = {
  spender: boolean
  amount: number
  memo: string
  noteTxHash: string
}

export class NotesCommand extends IronfishCommand {
  static description = `Display the account notes`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account to get notes for',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(NotesCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    const response = client.getAccountNotesStream({ account })

    const screen = blessed.screen({ smartCSR: true, fullUnicode: true })
    const text = blessed.text()
    screen.append(text)

    const notes: Note[] = []

    for await (const { account, note } of response.contentStream()) {
      notes.push(note)
      const header = `\n ${account} - Account note\n`
      text.setContent(header + renderTable(notes))
      screen.render()
    }
  }
}

function renderTable(notes: Note[]): string {
  const columns: CliUx.Table.table.Columns<Note> = {
    isSpender: {
      header: 'Spender',
      get: (row) => (row.spender ? `✔` : `x`),
    },
    amount: {
      header: 'Amount ($IRON)',
      get: (row) => oreToIron(row.amount),
    },
    memo: {
      header: 'Memo',
    },
    noteTxHash: {
      header: 'From Transaction',
    },
  }

  let result = ''

  CliUx.ux.table(notes, columns, {
    printLine: (line) => (result += `${String(line)}\n`),
  })

  return result
}
