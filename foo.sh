#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Removing Accounts"
rm -rf ~/.ironfish/accounts

echo "Copying Accounts"
cp -R ~/.ironfish/accounts_copy ~/.ironfish/accounts

echo "Running Migrations"
( cd ./ironfish-cli && yarn start migrations:start )
