#!/usr/bin/env bash

# Finds files in a given directory with a given file extension that don't have
# an MPL license header.
# $ lintHeaders ./src *.rs

license="/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */"

files=$(find $1 -type f -name $2)

result=0

for file in ${files[@]}; do
  if ! [ "$(head $file -n3)" = "$license" ]; then
    echo "Incorrect header in $file"
    result=1
  fi
done

exit $result