#!/bin/sh

# Disable core dumps
ulimit -c 0

exec /usr/share/ironfish/bin/run "$@"
