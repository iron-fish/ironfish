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

function check_error() {
    local return_code=$?
    local error_message="$1"

    if [ $return_code -ne 0 ]; then
        echo "$error_message"
        exit 1
    fi
}

function import_account_interactively() {
    local account_name="$1"
    local file_contents="$2"
    echo "Testing interactive import."
    expect -c "
        spawn yarn --cwd .. start wallet:import
        expect \"Paste the output of wallet:export, or your spending key:\"
        send {${file_contents}}
        send \"\r\"
            expect {
            \"Paste the output of wallet:export, or your spending key:\" {
                exp_continue
            }
            \"Enter a new account name:\" {
                send \"$account_name\\r\"
                exp_continue
            }
            \"Account $account_name imported\" {
                # Success, do nothing
            }
            eof
        }
    "
    check_error "Import failed for $account_name"
    check_import_success "$ACCOUNT_NAME"
    yarn --cwd .. start wallet:delete $ACCOUNT_NAME --wait
    check_error "Deletion failed for $account_name"
    check_delete_success "$ACCOUNT_NAME"
}


function import_account_by_pipe() {
    echo "Testing import by pipe."
    local account_name="$1"
    local test_file="$2"
    expect -c "
        spawn sh -c \"cat $test_file | yarn --cwd .. start wallet:import\"
        expect {
            \"Enter a new account name:\" {
                send \"$account_name\\r\"
                exp_continue
            }
            \"Account $account_name imported\" {
                set output \$expect_out(buffer)
                exp_continue
            }
            eof {
                set output \$expect_out(buffer)
            }
        }
        puts \$output
    "
    check_error "Import failed for $account_name"
    check_import_success "$account_name"
    yarn --cwd .. start wallet:delete $account_name --wait
    check_error "Deletion failed for $account_name"
    check_delete_success "$account_name"
}




function import_account_by_path() {
    echo "Testing import by path."
    local account_name="$1"
    local test_file="./scripts/""$2"
    expect -c "
        spawn yarn --cwd .. start wallet:import --path $test_file
        expect {
            \"Enter a new account name:\" {
                send \"$account_name\\r\"
                exp_continue
            }
            \"Account $account_name imported\" {
                set output \$expect_out(buffer)
            }
            eof {
                set output \$expect_out(buffer)
            }
        }
        puts \$output
    "
    check_error "Import failed for $account_name"
    check_import_success "$account_name"
    yarn --cwd .. start wallet:delete $account_name --wait
    check_error "Deletion failed for $account_name"
    check_delete_success "$account_name"
}

TEST_FIXTURE_LOCATION='./import-export-test/'
for TEST_FILE in "${TEST_FIXTURE_LOCATION}"*.txt
    do
    FILENAME=$(basename -- "$TEST_FILE")
    ACCOUNT_NAME="${FILENAME%.*}"
    FILE_CONTENTS=$(cat "$TEST_FILE")

    import_account_interactively "$ACCOUNT_NAME" "$FILE_CONTENTS"
    import_account_by_path "$ACCOUNT_NAME" "$TEST_FILE"
    # Skip import_account_by_pipe if the filename contains "mnemonic"
    if [[ "$FILENAME" != *"mnemonic"* ]]; then
        import_account_by_pipe "$ACCOUNT_NAME" "$TEST_FILE"
    fi
done

