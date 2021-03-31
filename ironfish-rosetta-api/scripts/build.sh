#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cd ../../

if ! command -v rsync &> /dev/null; then
    echo "rsync is not installed but is required"
    exit 1
fi

echo "Building WASM"
( cd ironfish-wasm && yarn run build:node )

echo "Installing from lockfile"
yarn --non-interactive --frozen-lockfile --ignore-scripts

echo "Building Rosetta project"
cd ironfish-rosetta-api
yarn build

echo "Outputting build to $PWD/build.rosetta"
rm -rf build.rosetta
mkdir build.rosetta

echo "Packing Rosetta"
yarn pack -f ./build.rosetta/packaged.tar.gz
cd build.rosetta
tar zxvf packaged.tar.gz

cd package
echo "Copying build"
cp -R ../../build ./

echo "Copying node_modules"
rsync -L -avrq --exclude='ironfish-rosetta-api' ../../../node_modules ./

echo "Packaging build into ironfish-rosetta-api.tar.gz"
cd ..
mv package ironfish-rosetta-api
tar -cf ironfish-rosetta-api.tar.gz ironfish-rosetta-api