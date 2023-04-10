#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

ENABLE_LOGS=0
DATA_DIR="../testdbs/importexport"
TIMEFORMAT='Success in %3lR'

if ! command -v expect &> /dev/null; then
    echo "expect is not installed but is required"
    exit 1
fi

if [[ $ENABLE_LOGS -eq 1 ]] ; then
    exec 3>&1
else
    exec 3>/dev/null
fi

# check if import was successful
function check_import_success() {
    local account_name=$1
    ACCOUNTS_OUTPUT=$(../bin/ironfish wallet:accounts -d $DATA_DIR)

    if ! echo "$ACCOUNTS_OUTPUT" | grep -q "$account_name"; then
        echo "Import failed for $account_name"
        exit 1
    fi
}

# check if deletion was successful
function delete_account() {
    local account_name=$1

    ../bin/ironfish wallet:delete -d $DATA_DIR $account_name &> /dev/null

    ACCOUNTS_OUTPUT=$(../bin/ironfish wallet:accounts -d $DATA_DIR)

    if echo "$ACCOUNTS_OUTPUT" | grep -q "$account_name"; then
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

    expect -c "
        spawn ../bin/ironfish wallet:import -d $DATA_DIR --name $account_name
        expect \"Paste the output of wallet:export, or your spending key:\"
        send {${file_contents}}
        send \"\r\"
            expect {
            \"Paste the output of wallet:export, or your spending key:\" {
                exp_continue
            }
            \"Account $account_name imported\" {
                # Success, do nothing
            }
            eof
        }
    " >&3

    check_error "Import failed for $account_name"
    check_import_success "$ACCOUNT_NAME"
}


function import_account_by_pipe() {
    local account_name="$1"
    local test_file="$2"

    expect -c "
        spawn sh -c \"cat $test_file | ../bin/ironfish wallet:import -d $DATA_DIR --name $account_name\"
        expect {
            \"Account $account_name imported\" {
                set output \$expect_out(buffer)
                exp_continue
            }
            eof {
                set output \$expect_out(buffer)
            }
        }
        puts \$output
    " >&3

    check_error "Import failed for $account_name"
    check_import_success "$account_name"
}

function import_account_by_path() {
    local account_name="$1"
    local test_file="$2"

    expect -c "
        spawn ../bin/ironfish wallet:import --path $test_file -d $DATA_DIR --name $account_name
        expect {
            \"Account $account_name imported\" {
                set output \$expect_out(buffer)
            }
            eof {
                set output \$expect_out(buffer)
            }
        }
        puts \$output
    " >&3

    check_error "Import failed for $account_name"
    check_import_success "$account_name"
}

rm -rf $DATA_DIR

for TEST_FILE in ./import-export-test/*.txt
    do
    FILENAME=$(basename -- "$TEST_FILE")
    ACCOUNT_NAME="${FILENAME%.*}"
    FILE_CONTENTS=$(cat "$TEST_FILE")

    if [[ "$FILENAME" != *"mnemonic"* ]]; then
        echo "Running import by pipe:  $TEST_FILE"
        time import_account_by_pipe "$ACCOUNT_NAME" "$TEST_FILE"
        delete_account "$ACCOUNT_NAME"
    fi

    echo "Running import by input: $TEST_FILE"
    time import_account_interactively "$ACCOUNT_NAME" "$FILE_CONTENTS"
    delete_account "$ACCOUNT_NAME"

    echo "Running import by path:  $TEST_FILE"
    time import_account_by_path "$ACCOUNT_NAME" "$TEST_FILE"
done

