; hooks.nsh - Custom NSIS hooks for PotoHub Booth Client
; Workaround 1: Otomatisasi instalasi UsbDk agar kamera USB terhubung tanpa Zadig manual

!macro NSIS_HOOK_POSTINSTALL
    ; Cek apakah driver UsbDk sudah terpasang di Windows
    ${IfNot} ${FileExists} "$WINDIR\System32\drivers\UsbDk.sys"
        DetailPrint "Memasang driver UsbDk untuk koneksi kamera USB otomatis..."
        ${If} ${FileExists} "$INSTDIR\drivers\UsbDk_1.0.22_x64.msi"
            nsExec::ExecToLog 'msiexec.exe /i "$INSTDIR\drivers\UsbDk_1.0.22_x64.msi" /qn /norestart'
        ${EndIf}
    ${EndIf}
!macroend
