#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

(
    echo ""
    echo "Generating test fixtures"
    cd ../ironfish-cli
    yarn test
    cd ../ironfish
    yarn test
)

(
    echo ""
    echo "Generating slow test fixtures"
    cd ../ironfish
    yarn test:slow
)

(
    echo ""
    echo "Generating perf test fixtures"
    cd ../ironfish
    yarn test:perf
)
