#!/bin/bash

set -e # exit immediately if anything returns with non-zero exit code

# Change working directory to the script's directory
cd "$(dirname "$0")"


# check if import was successful
function check_import_success() {
    local account_name=$1
    ACCOUNTS_OUTPUT=$(yarn --cwd .. start wallet:accounts)

    if echo "$ACCOUNTS_OUTPUT" | grep -q "$account_name"; then
        echo "Import successful for $account_name"
    else
        echo "Import failed for $account_name"
        exit 1
    fi
}

# check if deletion was successful
function check_delete_success() {
    local account_name=$1
    ACCOUNTS_OUTPUT=$(yarn --cwd .. start wallet:accounts)

    if ! echo "$ACCOUNTS_OUTPUT" | grep -q "$account_name"; then
        echo "Deletion successful for $account_name"
    else
        echo "Deletion failed for $account_name"
        exit 1
    fi
}

function import_account_interactively() {
    echo "Testing interactive import."
    IMPORT_OUTPUT=$(expect -c "
        spawn yarn --cwd .. start wallet:import
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
    check_import_success "$ACCOUNT_NAME"
    DELETE_OUTPUT=$(yarn --cwd .. start wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$ACCOUNT_NAME"
}


function import_account_by_pipe() {
    echo "Testing import by pipe."
    IMPORT_OUTPUT=$(expect -c "
        spawn sh -c \"cat $TEST_FILE | yarn --cwd .. start wallet:import\"
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
    check_import_success "$ACCOUNT_NAME"
    DELETE_OUTPUT=$(yarn --cwd .. start wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$ACCOUNT_NAME"
}




function import_account_by_path() {
    echo "Testing import by path."
    ACCOUNT_BY_PATH_TEST_FILE="./scripts/"${TEST_FILE}
    IMPORT_OUTPUT=$(expect -d -c "
        spawn yarn --cwd .. start wallet:import --path $ACCOUNT_BY_PATH_TEST_FILE
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
    check_import_success "$ACCOUNT_NAME"
    DELETE_OUTPUT=$(yarn --cwd .. start wallet:delete $ACCOUNT_NAME --wait)
    # verify return code of delete
    if [ $? -ne 0 ]; then
        echo "Deletion failed for $ACCOUNT_NAME"
        exit 1
    fi
    check_delete_success "$ACCOUNT_NAME"
}

#this script is always run from the root of ironfish
TEST_FIXTURE_LOCATION='./import-export-test/'
for TEST_FILE in "${TEST_FIXTURE_LOCATION}"*.txt
    do
    FILENAME=$(basename -- "$TEST_FILE")
    ACCOUNT_NAME="${FILENAME%.*}"
    FILE_CONTENTS=$(cat "$TEST_FILE")

    import_account_interactively
    import_account_by_path
    # Skip import_account_by_pipe if the filename contains "mnemonic"
    if [[ "$FILENAME" != *"mnemonic"* ]]; then
        import_account_by_pipe
    fi
done

