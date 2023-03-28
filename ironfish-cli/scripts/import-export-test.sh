#start a clean test node

#import each account
for version in 0p1p[65...72]
    for format in [blob, json, mnemonic]
        filename = version + format

        import filename interactively
        delete account --wait

        cat filename > import
        delete account --wait

        import --path filename
        delete account --wait

        

