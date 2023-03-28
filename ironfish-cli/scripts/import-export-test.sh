#!/bin/bash
#start a clean test node

TEST_VECTOR_LOCATION='./import-export-test-vector/'
FORMAT_ARRAY=( blob json mnemonic )
#import each account
for VERSION in {65..72}
    do
    for FORMAT in "${FORMAT_ARRAY[@]}"
        do
        TEST_INPUT=${TEST_VECTOR_LOCATION}0p1p${VERSION}_${FORMAT}.txt
        echo $TEST_INPUT
        cat $TEST_INPUT

        # import filename interactively
        # delete account --wait

        # cat filename > import
        # delete account --wait

        # import --path filename
        # delete account --wait
        done
    done



