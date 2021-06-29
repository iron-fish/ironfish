#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cd ../..

echo "Building Docker Image"
cp .gitignore .dockerignore

docker build . \
    --progress plain \
    --tag ironfish-http-api:latest \
    --file ironfish-http-api/Dockerfile

docker run \
    --env DOCKER_VERIFY=1 \
    --interactive \
    --rm \
    ironfish-http-api:latest start
