#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

cat .gitignore - > .dockerignore <<EOF
# Do not send all the files from the .git directory to the Docker daemon to
# make builds faster. Send only the strictly necessary files/directories to
# make git know the hash of the HEAD.
.git
!.git/HEAD
!.git/refs
!.git/objects
.git/objects/*
EOF

echo "Building Docker Image"

export DOCKER_BUILDKIT=1

docker build . \
    --progress plain \
    --tag ironfish:latest \
    --file ironfish-cli/Dockerfile

docker run \
    --interactive \
    --rm \
    ironfish:latest --version
