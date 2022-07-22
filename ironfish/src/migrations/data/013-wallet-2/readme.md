## Old Stores

### meta
  - key:
    - type: defaultAccountName | headHash
    - encoder: StringEncoding
  - value
    - type: string | null
    - encoder: MetaValueEncoding

### noteToNullifier
  - key:
    - type: string
    - encoder: StringEncoding
  - value
    - type:
        ```
        {
            nullifierHash: string | null
            noteIndex: number | null
            spent: boolean
        }
        ```
    - encoder: NoteToNullifiersValueEncoding

### nullifierToNote
  - key:
    - type: string
    - encoder: StringEncoding
  - value
    - type: string
    - encoder: StringEncoding

### accounts
  - key:
    - type: string
    - encoder: StringEncoding
  - value
    - type:
      ```
      {
            name: string
            spendingKey: string
            incomingViewKey: string
            outgoingViewKey: string
            publicAddress: string
            rescan: number | null
      }
      ```
    - encoder: AccountsValueEncoding

### transactions
  - key:
    - type: Buffer
    - encoder: BufferEncoding
  - value
    - type:
        ```
        {
            transaction: Buffer
            blockHash: string | null
            submittedSequence: number | null
        }
        ```
    - encoder: TransactionsValueEncoding

## Removed Stores
 *b nullifierToNote
 * noteToNullifier

## Changed Stores

### meta
  - key:
    - type: defaultAccountId
    - encoder: StringEncoding
  - value
    - type: string | null
    - encoder: MetaValueEncoding
  - notes
    - Added defaultAccountId
    - Removed defaultAccountName
    - Removed headHash

## accounts
  - key:
    - type: string
    - encoder: StringEncoding
  - value
    - type:
      ```
      {
          name: string
          spendingKey: string
          incomingViewKey: string
          outgoingViewKey: string
          publicAddress: string
      }
      ```
    - encoder: AccountsValueEncoding
  - notes
    - Removed rescan
    - Key changed from account name to account id

## New Stores

### nullifierToNoteHash
  - key:
    - type: string
    - encoder: StringHashEncoding
  - value
    - type: string
    - encoder StringEncoding

### headHashes
  - key:
    - type: string
    - encoder: StringEncoding
  - value
    - type: string | null
    - encoder: NullableStringEncoding
  - notes
    - This is a map of account id to the blockchain block hash as a hex string that account is updated to.

### balances
  - key:
    - type: string
    - encoder: StringEncoding
  - value
    - type: bigint
    - encoder: BigIntLEEncoding
  - notes
    - This is a map of account id to the unconfirmed balance

### decryptedNotes
  - key:
    - type: string
    - encoder: StringHashEncoding
  - value
    - type:
      ```
      {
          accountId: string
          noteIndex: number | null
          nullifierHash: string | null
          serializedNote: Buffer
          spent: boolean
          transactionHash: Buffer | null
      }
      ```
    - encoder: DecryptedNotesValueEncoding
  - notes
    - This is a collection of all decrypted notes, this used to be `noteToNullifier`

# Summary
  1. Loop through `noteToNullifier`
        1. Attempt to decrypt notes to figure out the account ID
            1. Index into decryptedNotes using above info
            1. Keep track of unconfirmed balances for each account
  1. Use unconfirmed balances to index into new `balances` store
  1. Index new headHashes store for each account using Meta.headHash
  1. Index accounts by id from old names
        1. Unindex accounts by name from accounts store
  1. Delete noteToNullifier
  1. Delete Meta.headHash
