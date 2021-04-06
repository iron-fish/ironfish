#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${REGISTRY_URL-}" ]; then
    echo "Set REGISTRY_URL before running deploy-docker.sh"
    exit 1
fi

docker tag ironfish:latest ${REGISTRY_URL}/ironfish:latest
docker push ${REGISTRY_URL}/ironfish:latest
