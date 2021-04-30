#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${REGISTRY_URL-}" ]; then
    echo "Set REGISTRY_URL before running deploy-docker.sh"
    exit 1
fi

if [ -z "${PACKAGE_NAME-}" ]; then
    echo "Set PACKAGE_NAME before running deploy-docker.sh"
    exit 1
fi


docker tag ironfish:latest ${REGISTRY_URL}/${PACKAGE_NAME}:latest
docker push ${REGISTRY_URL}/${PACKAGE_NAME}:latest

