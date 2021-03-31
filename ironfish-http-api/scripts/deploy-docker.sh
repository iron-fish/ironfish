#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${AWS_BLOCK_API_REGISTRY_URL-}" ]; then
    echo "Set AWS_BLOCK_API_REGISTRY_URL before running deploy-docker.sh"
    exit 1
fi

docker tag ironfish-http-api:latest ${AWS_BLOCK_API_REGISTRY_URL}:latest
docker push ${AWS_BLOCK_API_REGISTRY_URL}:latest
