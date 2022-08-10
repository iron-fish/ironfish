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


GIT_HASH=$(git rev-parse --short HEAD)

echo "Inserting GIT hash into ironfish-cli/package.json as gitHash"
cat <<< "$(jq --arg gh "$GIT_HASH" '.gitHash = $gh' < ironfish-cli/package.json)" > ironfish-cli/package.json

echo "Inserting GIT hash into ironfish/package.json as gitHash"
cat <<< "$(jq --arg gh "$GIT_HASH" '.gitHash = $gh' < ironfish/package.json)" > ironfish/package.json

echo "Installing from lockfile"
yarn --non-interactive --frozen-lockfile

echo "Building all projects"
yarn build

echo "Removing lifecycle scripts"
cat <<< "$(jq 'del(.scripts.postinstall)' < package.json)" > package.json

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
# Exclude fsevents to fix brew audit error:
# "Binaries built for a non-native architecture were installed into ironfish's prefix"
rsync -L -avrq --exclude 'ironfish' --exclude 'fsevents' ../../../node_modules ./
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
