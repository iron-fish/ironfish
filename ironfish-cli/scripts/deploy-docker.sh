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

if [ -z "${GITHUB_SHA-}" ]; then
    echo "Set GITHUB_SHA before running deploy-docker.sh"
    exit 1
fi

if [ -z "${GITHUB_REF-}" ]; then
    echo "Set GITHUB_REF before running deploy-docker.sh"
    exit 1
fi

docker tag ironfish:latest ${REGISTRY_URL}/${PACKAGE_NAME}:latest
docker tag ironfish:latest ${REGISTRY_URL}/${PACKAGE_NAME}:${GITHUB_REF}
docker tag ironfish:latest ${REGISTRY_URL}/${PACKAGE_NAME}:${GITHUB_SHA}

docker push --all-tags ${REGISTRY_URL}/${PACKAGE_NAME}
