#!/bin/bash

# check if import was successful
function check_import_success() {
    if [[ "$1" == *"Account $2 imported"* ]]; then
        echo "Import successful for $2"
    else
        echo "Import failed for $2"
        exit 1
    fi
}

# check if deletion was successful
function check_delete_success() {
    if [[ "$1" == *"Account '$2' successfully deleted."* ]]; then
        echo "Deletion successful for $2"
    else
        echo "Deletion failed for $2"
        exit 1
    fi
}

function import_account_interactively() {
    IMPORT_OUTPUT=$(expect -d -c "
        spawn ironfish wallet:import
        expect \"Paste the output of wallet:export, or your spending key:\"
        send \"$FILE_CONTENTS\\r\"
        expect {
            \"Enter a new account name:\" {
                send \"$ACCOUNT_NAME\\r\"
            }
            eof
        }
    ")
    # verify return code of import
    ironfish wallet:accounts
    if [ $? -ne 0 ]; then
        echo "Import failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_import_success "$IMPORT_OUTPUT" "$ACCOUNT_NAME"
    DELETE_OUTPUT=$(ironfish wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$DELETE_OUTPUT" "$ACCOUNT_NAME"
}

function import_account_by_pipe() {
    expect -c "
        spawn sh -c \"cat $TEST_FILE | ironfish wallet:import\"
        expect {
            \"Enter a new account name:\" {
                send \"$ACCOUNT_NAME\\r\"
                exp_continue
            }
            \"Account $ACCOUNT_NAME imported\" {
                set output \$expect_out(buffer)
            }
            eof
        }
    "
    # verify import success by examining captured output
    if ! echo "$output" | grep -q "Account $ACCOUNT_NAME imported"; then
        echo "Import failed for $ACCOUNT_NAME"
        exit 1
    fi
    DELETE_OUTPUT=$(ironfish wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$DELETE_OUTPUT" "$ACCOUNT_NAME"
}

function import_account_by_path() {
    IMPORT_OUTPUT=$(expect -c "
        spawn ironfish wallet:import --path $TEST_FILE
        expect {
            \"Enter a new account name:\" {
                send \"$ACCOUNT_NAME\\r\"
                exp_continue
            }
            \"Account $ACCOUNT_NAME imported\" {
                set output \$expect_out(buffer)
            }
            eof {
                set output \$expect_out(buffer)
            }
        }
        puts \$output
    ")
    # check for success message in the output
    if ! echo "$IMPORT_OUTPUT" | grep -q "Account $ACCOUNT_NAME imported"; then
        echo "Import failed for $ACCOUNT_NAME"
        exit 1
    fi
    DELETE_OUTPUT=$(ironfish wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$DELETE_OUTPUT" "$ACCOUNT_NAME"
}

TEST_VECTOR_LOCATION='./import-export-test-vector/'
# FORMAT_ARRAY=( blob json mnemonic )
FORMAT_ARRAY=( mnemonic )
# for VERSION in {65..72}
for VERSION in {65..65}
    do
    for FORMAT in "${FORMAT_ARRAY[@]}"
        do
        ACCOUNT_NAME=0p1p${VERSION}_${FORMAT}
        TEST_FILE=${TEST_VECTOR_LOCATION}${ACCOUNT_NAME}.txt
        echo $TEST_FILE
        FILE_CONTENTS=$(cat $TEST_FILE)
        # import_account_interactively
        import_account_by_pipe
        # import_account_by_path
        done
    done

