#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cd ../..

echo "Building Docker Image"
cp .gitignore .dockerignore

docker build . \
    --progress plain \
    --tag ironfish-rosetta-api:latest \
    --file ironfish-rosetta-api/Dockerfile
