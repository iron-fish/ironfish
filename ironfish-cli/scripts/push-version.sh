#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cd ../../

if ! command -v jq &> /dev/null; then
    echo "jq is not installed but is required"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "curl is not installed but is required"
    exit 1
fi

VERSION="$(jq -r '.version' ironfish-cli/package.json)"
STATUS="$(curl \
    --write-out '%{http_code}' \
    --silent \
    --output /dev/null \
    --request POST \
    --header "authorization:Bearer $IRON_FISH_API_KEY" \
    --data "version=$VERSION" \
    "$IRON_FISH_API_URL/versions")"

if [[ $STATUS -ne 201 ]]; then
    echo "There was an error pushing the version to the API. See API logs for more information."
    exit 1
else
    echo "Version pushed successfully."
    exit 0
fi
