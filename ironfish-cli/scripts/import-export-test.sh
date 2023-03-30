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
    echo "Testing interactive import."
    IMPORT_OUTPUT=$(expect -c "
        spawn yarn --cwd ./ironfish-cli start wallet:import
        expect \"Paste the output of wallet:export, or your spending key:\"
        send {${FILE_CONTENTS}}
        send \"\r\"
            expect {
            \"Paste the output of wallet:export, or your spending key:\" {
                exp_continue
            }
            \"Enter a new account name:\" {
                send \"$ACCOUNT_NAME\\r\"
                exp_continue
            }
            \"Account $ACCOUNT_NAME imported\" {
                # Success, do nothing
            }
            eof
        }
    ")
    # verify return code of import
    if [ $? -ne 0 ]; then
        echo "Import failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_import_success "$IMPORT_OUTPUT" "$ACCOUNT_NAME"
    DELETE_OUTPUT=$(yarn --cwd ./ironfish-cli start wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$DELETE_OUTPUT" "$ACCOUNT_NAME"
}


function import_account_by_pipe() {
    echo "Testing import by pipe."
    IMPORT_OUTPUT=$(expect -c "
        spawn sh -c \"cat $TEST_FILE | yarn --cwd ./ironfish-cli start wallet:import\"
        expect {
            \"Enter a new account name:\" {
                send \"$ACCOUNT_NAME\\r\"
                exp_continue
            }
            \"Account $ACCOUNT_NAME imported\" {
                set output \$expect_out(buffer)
                exp_continue
            }
            eof {
                set output \$expect_out(buffer)
            }
        }
        puts \$output
    ")
    # verify return code of import
    if [ $? -ne 0 ]; then
        echo "Import failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_import_success "$IMPORT_OUTPUT" "$ACCOUNT_NAME"
    DELETE_OUTPUT=$(yarn --cwd ./ironfish-cli start wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$DELETE_OUTPUT" "$ACCOUNT_NAME"
}




function import_account_by_path() {
    echo "Testing import by path."
    IMPORT_OUTPUT=$(expect -c "
        spawn yarn --cwd ./ironfish-cli start wallet:import --path $TEST_FILE
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
    # verify return code of import
    if [ $? -ne 0 ]; then
        echo "Import failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_import_success "$IMPORT_OUTPUT" "$ACCOUNT_NAME"
    DELETE_OUTPUT=$(yarn --cwd ./ironfish-cli start wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$DELETE_OUTPUT" "$ACCOUNT_NAME"
}

TEST_VECTOR_LOCATION='./import-export-test-vector/'
FORMAT_ARRAY=( blob json mnemonic)
for VERSION in {65..72}
    do
    for FORMAT in "${FORMAT_ARRAY[@]}"
        do
        ACCOUNT_NAME=0p1p${VERSION}_${FORMAT}
        TEST_FILE=${TEST_VECTOR_LOCATION}${ACCOUNT_NAME}.txt
        echo $TEST_FILE
        FILE_CONTENTS=$(cat $TEST_FILE)
        import_account_interactively
        import_account_by_path
        # Skip import_account_by_pipe if FORMAT is mnemonic
        if [ "$FORMAT" != "mnemonic" ]; then
            import_account_by_pipe
        fi
        done
    done

