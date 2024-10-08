# Ledger

#### IronfishApp.appInfo() (OS CLA)
    C APP
        If Dashboard Open:
            If Locked: throw 0x5515 DeviceLocked
            If Unlocked: throw 0x6e01 (APP NOT OPEN)
        If App Open:
            If Locked: throw 0x5515 Device Locked
            If Unlocked: returns successfully
    RUST APP (OS RPC)
        If Dashboard Open:
            If Locked: throw 0x5515 DeviceLocked
            If Unlocked: throw 0x6e01 (APP NOT OPEN)
        If App Open:
            If Locked: throw INS_NOT_SUPPORTED
            If Unlocked: returns successfully

##### IronfishApp.getVersion (APP CLA)
    C APP
        If Dashboard Open:
            If Locked: throw 0x5515 DeviceLocked
            If Unlocked: throw 0x6e01 (APP NOT OPEN)
        If App Open:
            If Locked: throw 0x5515 Device Locked
            If Unlocked: returns successfully
    RUST APP
        If Dashboard Open:
            If Locked: throw 0x5515 DeviceLocked
            If Unlocked: throw 0x6e01 (APP NOT OPEN)
        If App Open:
            If Locked: throw INS_NOT_SUPPORTED
            If Unlocked: returns successfully()
