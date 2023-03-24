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

if [ -z "${GITHUB_REF_NAME-}" ]; then
    echo "Set GITHUB_REF_NAME before running deploy-docker.sh"
    exit 1
fi

if [ -z "${TAG_LATEST-}" ]; then
    echo "Set TAG_LATEST before running deploy-docker.sh"
    exit 1
fi

docker tag ironfish:latest ${REGISTRY_URL}/${PACKAGE_NAME}:latest
docker tag ironfish:latest ${REGISTRY_URL}/${PACKAGE_NAME}:${GITHUB_REF_NAME}
docker tag ironfish:latest ${REGISTRY_URL}/${PACKAGE_NAME}:${GITHUB_SHA}

$TAG_LATEST && docker push ${REGISTRY_URL}/${PACKAGE_NAME}:latest
docker push ${REGISTRY_URL}/${PACKAGE_NAME}:${GITHUB_REF_NAME}
docker push ${REGISTRY_URL}/${PACKAGE_NAME}:${GITHUB_SHA}
