#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${AWS_REGISTRY_URL-}" ]; then
    echo "Set AWS_REGISTRY_URL before running deploy-docker.sh"
    exit 1
fi

docker tag ironfish:latest ${AWS_REGISTRY_URL}/ironfish:latest
docker push ${AWS_REGISTRY_URL}/ironfish:latest
