#!/bin/bash
#start a clean test node

TEST_VECTOR_LOCATION='./import-export-test-vector/'
# FORMAT_ARRAY=( blob json mnemonic ) #TODO mnemonic case needs to respond to name request too
FORMAT_ARRAY=( blob )
#import each account
# for VERSION in {65..72}
for VERSION in {65..65}
    do
    for FORMAT in "${FORMAT_ARRAY[@]}"
        do
        ACCOUNT_NAME=0p1p${VERSION}_${FORMAT}
        TEST_FILE=${TEST_VECTOR_LOCATION}${ACCOUNT_NAME}.txt
        echo $TEST_FILE
        FILE_CONTENTS=$(cat $TEST_FILE)
        # import filename interactively
        expect -c "
            spawn ironfish wallet:import
            expect \"Paste the output of wallet:export, or your spending key:\"
            send \"$FILE_CONTENTS\\r\"
            interact
        "
        # TODO verify successful import
        ironfish wallet:delete $ACCOUNT_NAME --wait
        # TODO verify successful deletion

        # # test import by pipe
        ironfish wallet:import < $TEST_FILE
        # # TODO verify successful import
        ironfish wallet:delete $ACCOUNT_NAME --wait
        # # TODO verify successful deletion

        # # test import by path
        ironfish wallet:import --path $TEST_FILE
        # # TODO verify successful import
        ironfish wallet:delete $ACCOUNT_NAME --wait
        # # TODO verify successful deletion
        done
    done



