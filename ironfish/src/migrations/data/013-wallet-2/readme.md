# Summary
  - **Changed Stores**
    - meta
      - Added defaultAccountId
      - Removed defaultAccountName
      - Removed headHash
    - transactions
      - Added field `sequence` which is the sequence on the chain or null
    - accounts
      - Removed field `rescan`
      - Added a new field `id` which is a uuid()
      - Key changed from field `name` to field `id`
  - **New Stores**
    - decryptedNotes
      - This new store represents notes the wallet is able to decrypt. The information in this store came from the old `noteToNullifier`, with new fields that need to be calculated. Most of the migration is calculating this new store. We'll need to redecrypt the note from `noteToNullifier` to figure out which account this comes from.
    - balance
      - This is a map of values from the store `accounts.id`, to the unconfirmed balance of that account. Unconfirmed balance is the total of all notes regardless of chain status. This contains the new materialized balance optimization.
    - headHashes
      - This is a map of `accounts.id` to the blockchain block hash as a hex string that the account is updated to.
    - nullifierToNoteHash
      - This is a map of `decrypytedNotes.nullifierHash` to `note.merkleHash()` in hex form
      - This replaces the old store `nullifierToNote`
  - **Deleted Stores**
    - nullifierToNote
      - Replaced with nullifierToNoteHash
    - noteToNullifier
      - Replaced with decryptedNotes

# Strategy
  1. Build a map from note hash to transaction hash
    - The new wallet tracks which transaction a note from but the old wallet doesn't. We need this to quickly figure out which transaction to find the note in.
  1. Migrate Accounts
    1. Loop through `accounts`
      - Generate ids and write them
      - Index accounts by id from old names
      - Unindex accounts by name from accounts store
  1. Migrate `decryptedNotes`
    1. Loop through `noteToNullifier`
          1. Attempt to decrypt notes in the TX found using the map from step 1 to figure out the account ID, and transaction hash for the note
              1. Add a new decryptedNotes for each noteToNullifier value using above info
              1. Keep track of unconfirmed balances for each account
  1. Migrate `balances`
    1. Use unconfirmed balances calculated from migrating decrypted notes to index into new `balances` store
  1. Migrate `headHashes`
    1. Index new headHashes store for each account using Meta.headHash
  1. Migrate `meta`
  1. Delete store `noteToNullifier`
  1. Delete store `nullifierToNote`

# Potential issues:
  - What happens if we cant decrypt a note?
    - We drop it.
    - Probably was decrypted previously with an account that hasd been since removed.
    - Worse case they can rescan
  - Could there be memory issues?
    - Yes, we load all transactions, notes, and nullifier into memory during the migration and don't unload them until the migration has finished.
