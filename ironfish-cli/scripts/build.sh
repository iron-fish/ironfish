#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cd ../../

if ! command -v jq &> /dev/null; then
    echo "jq is not installed but is required"
    exit 1
fi

if ! command -v rsync &> /dev/null; then
    echo "rsync is not installed but is required"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "git is not installed but is required"
    exit 1
fi

echo "Inserting GIT hash into ironfish/package.json as gitHash"
GIT_HASH=$(git rev-parse --short HEAD)
cat <<< "$(jq --arg gh "$GIT_HASH" '.gitHash = $gh' < ironfish/package.json)" > ironfish/package.json

echo "Removing lifecycle scripts"
cat <<< "$(jq 'del(.scripts.prebuild)' < package.json)" > package.json
cat <<< "$(jq 'del(.scripts.preinstall)' < package.json)" > package.json

echo "Building WASM"
( cd ironfish-wasm && yarn run build:node )

echo "Installing from lockfile"
yarn --non-interactive --frozen-lockfile

echo "Building all projects"
yarn build

cd ironfish-cli
echo "Outputting build to $PWD/build.cli"
rm -rf build.cli
mkdir build.cli

echo "Packing CLI"
yarn pack -f ./build.cli/packaged.tar.gz
cd build.cli
tar zxvf packaged.tar.gz

echo "Installing production node_modules"
rm -rf ../../node_modules
cd ../..
yarn --non-interactive --frozen-lockfile --production
cd ironfish-cli/build.cli

cd package
echo "Copying build"
cp -R ../../build ./

echo "Copying node_modules"
rsync -L -avrq --exclude='ironfish-cli' ../../../node_modules ./
# Copy node_modules from ironfish-cli folder into the production node_modules folder
# yarn --production seems to split some packages into different folders for some reason
cp -R ../../node_modules/* ./node_modules

echo ""
if ! ./bin/run --version > /dev/null; then
    echo "Failed to build ironfish"
else
    echo "Ironfish CLI built successfully"
fi

echo "Packaging build into ironfish-cli.tar.gz"
cd ..
mv package ironfish-cli
tar -cf ironfish-cli.tar.gz ironfish-cli
