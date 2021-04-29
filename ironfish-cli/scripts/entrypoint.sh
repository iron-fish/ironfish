#!/bin/sh

# Disable core dumps
ulimit -c 0

./bin/run "$@"

