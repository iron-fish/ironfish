# Iron Fish Database Migrations

The `migrations` module contains migration scripts used to upgrade Iron Fish databases when new features require schema changes.

## Template migrations

The easiest way to begin writing a new migration is to copy a template migration (e.g., `000-template` or `000-encrypted-wallet-template`). Each migration requires both the migration file (e.g., `000-template.ts`) and the directory in `migrations/data` with the matching name. That directory contains the schema definitions that the migration depends on: both the "old" schema that the migration reads from and the "new" schema that the migration writes to.

## Database

A migration must operate on only *one* database: the blockchain database or the wallet database. If a new feature requires schema changes in both databases, then the author must write separate migrations for each database.

## Naming

Each migration filename must be prefixed with a 3-digit prefix that matches the version of the affected database _after_ applying the migration. For example, `032-add-account-scanning` upgraded `VERSION_DATABASE_WALLET` to version 32.

Version numbers should increase by 1 with each migration. However, since there are two separate databases with separate version numbers this means the database version may increase by more than 1. For example, the `028-backfill-asset-owner` migration increased the version number of the blockchain database [from 14 to 28](https://github.com/iron-fish/ironfish/pull/4101/files#diff-f63f2b4a0d0d0c32cd4cf2835fd91d19ce078c42df7dcefc5680363346a131c7).

## Data stores and schemas

Migrations need access to both the "old" schema and the "new" schema for data stores that they operate on. Data must be read using the old schema and written using the new schema. Refer to one of the template migrations to see how old and new stores are added to a database.

### Old stores

Any data stores that a migration _reads from_ must be added to the "old" stores used during the migration, and the database encoding files for those data stores must be included in the `migrations/data/<migration_name>/old` directory.

For example, the `000-encrypted-wallet-template` migration reads from the `accounts` store, so `accountValue.ts` is included at `migrations/data/000-encrypted-wallet-template/old/accountValue.ts` to define the encoding used for reading from the store.

If a migration reads from a data store, but does not write to it, then the schema only needs to be defined in the "old" stores.

### New stores

Any data stores that a migration _writes to_ must be added to the "new" stores used during the migration, and the database encoding files for those data stores must be included in the `migrations/data/<migration_name>/new` directory.

If a migration only writes to a datastore, such as for an entirely new data store, then the schema only needs to be defined in the "new" stores.

## Forward and backward migration

The `Migration` abstract class defines both `forward` and `backward` methods that each migration should implement. The `forward` migration should read data from the "old" data stores and write data to the "new" data stores. Writing a `backward` migration is not required, but is recommended to help test migrations.

## Wallet encryption

Version 2.7.0 of `ironfish` added encryption support to the Iron Fish node wallet. All future migrations that operate on the `accounts` store in the wallet database must support migration on encrypted wallets. The `000-encrypted-wallet-template` migration demonstrates how to handle encrypted account data in a migration.

### Passphrase requirement

Migrations that need to access encrypted account data must throw an `EncryptedWalletMigrationError` if a wallet passphrase is not passed to the migration. The `EncryptedWalletMigrationError` error allows client code (e.g., CLI commands) to prompt the user for their wallet passphrase if needed.

```
if (account.encrypted) {
  if (!walletPassphrase) {
    throw new EncryptedWalletMigrationError('Cannot run migration on encrypted wallet')
  }
  . . .
}
```

### MasterKey

Wallet encryption uses the `MasterKey` to decrypt and encrypt account data. The migration must include the `masterKey` store in its "old" stores in order to read and unlock the master key before decrypting account data.

```
const masterKeyValue = await stores.old.masterKey.get('key')
Assert.isNotUndefined(masterKeyValue)

const masterKey = new MasterKey(masterKeyValue)
await masterKey.unlock(walletPassphrase)
```

### Decrypting accounts

Encrypted account data is decrypted using an locked master key along with the `salt` and `nonce` stored with the encrypted data. The "old" account schema encoding can then deserialize the decrypted data into an object.

```
const oldEncoding = new OldAccountValueEncoding()
const decrypted = masterKey.decrypt(account.data, account.salt, account.nonce)
decryptedAccount = oldEncoding.deserializeDecrypted(decrypted)
```

### Re-encrypting accounts

After applying the migration logic to a decrypted account the migrated data must be re-encrypted and written to new schema in encrypted form.

```
const newEncoding = new NewAccountValueEncoding()
const migratedSerialized = newEncoding.serialize(migrated)
const { ciphertext: data, salt, nonce } = masterKey.encrypt(migratedSerialized)

const encryptedAccount: OldEncryptedAccountValue = {
  encrypted: true,
  salt,
  nonce,
  data,
}

await stores.new.accounts.put(decryptedAccount.id, encryptedAccount, tx)
```
