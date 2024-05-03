#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

cat .gitignore - > .dockerignore <<EOF
# do not send the .git directory to the Docker daemon to make builds faster
.git
EOF

echo "Building Docker Image"

export DOCKER_BUILDKIT=1

docker build . \
    --platform linux/amd64,linux/arm64 \
    --progress plain \
    --tag ironfish:latest \
    --file ironfish-cli/Dockerfile

docker run \
    --platform linux/amd64 \
    --interactive \
    --rm \
    ironfish:latest --version

docker run \
    --platform linux/arm64 \
    --interactive \
    --rm \
    ironfish:latest --version
