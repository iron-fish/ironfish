#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cd ../..

echo "Building Docker Image"
cp .gitignore .dockerignore

docker build . \
    --progress plain \
    --tag ironfish:latest \
    --file ironfish-cli/Dockerfile

docker run \
    --interactive \
    --rm \
    ironfish:latest --version
