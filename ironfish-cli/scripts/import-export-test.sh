#!/bin/bash
#start a clean test node

TEST_VECTOR_LOCATION='./import-export-test-vector/'
# FORMAT_ARRAY=( blob json mnemonic )
FORMAT_ARRAY=( blob )
#import each account
# for VERSION in {65..72}
for VERSION in {65..65}
    do
    for FORMAT in "${FORMAT_ARRAY[@]}"
        do
        ACCOUNT_NAME=0p1p${VERSION}_${FORMAT}
        TEST_INPUT=${TEST_VECTOR_LOCATION}${ACCOUNT_NAME}.txt
        echo $TEST_INPUT
        cat $TEST_INPUT

        # import filename interactively
        # ironfish wallet:import
        # expect "Paste the output of wallet:export, or your spending key:\r"
        # send "$TEST_INPUT\r"
        # echo "imported $ACCOUNT_NAME"
        # TODO verify return code of import
        ironfish wallet:delete $ACCOUNT_NAME --wait
        # TODO verify return code of delete

        # test import by pipe
        ironfish wallet:import < $TEST_INPUT
        # TODO verify return code of import
        ironfish wallet:delete $ACCOUNT_NAME --wait
        # TODO verify return code of delete

        # test import by path
        ironfish wallet:import --path $TEST_INPUT
        # TODO verify return code of import
        ironfish wallet:delete $ACCOUNT_NAME --wait
        # TODO verify return code of delete
        done
    done



