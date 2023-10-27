#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

cat .gitignore - > .dockerignore <<EOF
# do not send the .git directory to the Docker daemon to make builds faster
.git
EOF

echo "Building Docker Image"

docker buildx build . \
    --progress plain \
    --tag ironfish:latest \
    --platform linux/amd64,linux/arm64,linux/arm/v7 \
    --output type=image \
    --file ironfish-cli/Dockerfile

docker run \
    --interactive \
    --rm \
    ironfish:latest --version
