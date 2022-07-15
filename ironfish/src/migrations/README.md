How do you calculate ifjr




### Migration Structure

This is a traditional migration system structure, where there is one database, and the migrator passes that database, or a connection down into each migration.

The main difference is that in Iron Fish, we don't know what databases a migration applies to, because the migration decides which databases it applies to.

#### Single Database
Database
  Migrator
    Migrations

### Iron Fish
Migrator
  Migrations
    Databases

### Why do migrations start at 10?
We already had a migration system and database version, so we need to start after the latest migration number.

 - Blockchain DB: 6
 - Accounts DB: 5
 - Mined Block Indexer DB: 2

### Migration Journal
We need an internal store in side the database to keep track of run migrations.

The migrations table needs to be stored per database.

Migrations
  001: true

Migrations
  001: {


  }

Journal
  version: 001
  meta: {}

