; hooks.nsh - Custom NSIS hooks for PotoHub Booth Client
; Mekanisme silent install UsbDk dinonaktifkan karena koneksi kamera Canon sudah menggunakan Canon EDSDK Native.

!macro NSIS_HOOK_POSTINSTALL
    ; Tidak ada instalasi driver tambahan yang diperlukan
!macroend
