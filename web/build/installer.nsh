!define MUI_ABORTWARNING
!define MUI_BGCOLOR "FFFFFF"
!define MUI_LICENSEPAGE_BGCOLOR "FFFFFF"
!define MUI_DIRECTORYPAGE_BGCOLOR "FFFFFF"
!define MUI_INSTFILESPAGE_COLORS "005ED6 FFFFFF"
!define MUI_LICENSEPAGE_CHECKBOX
!define MUI_LICENSEPAGE_TEXT_TOP "Harap baca perjanjian lisensi berikut sebelum melanjutkan instalasi."
!define MUI_LICENSEPAGE_CHECKBOX_TEXT "Saya telah membaca dan menyetujui perjanjian lisensi di atas."
!define MUI_LICENSEPAGE_BUTTON "Saya Setuju"
!define MUI_DIRECTORYPAGE_TEXT_TOP "Pilih folder tujuan untuk menginstal ITS Maps Windows. Program akan diinstal pada folder berikut."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Folder Tujuan"

!macro customHeader
  BrandingText "ITS Maps Windows 1.0.12"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "ITS Maps$\r$\nSelamat Datang"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "Aplikasi ini dikembangkan oleh Mahasiswa Telkom University.$\r$\n$\r$\nSetup akan memasang ITS Maps Windows sebagai aplikasi desktop untuk sinkronisasi realtime, peta interaktif, grafik lalu lintas, dan kamera Raspberry Pi."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Instalasi Selesai"
  !define MUI_FINISHPAGE_TEXT "ITS Maps Windows telah berhasil diinstal dan siap digunakan.$\r$\n$\r$\nTerima kasih telah mempercayai ITS Maps Windows untuk mendukung pemantauan lalu lintas secara real-time dan efektif."
  !define MUI_FINISHPAGE_BUTTON "Mulai"
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Jalankan ITS Maps Windows"
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall ITS Maps"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "Apakah Anda yakin menguninstall aplikasi ini?$\r$\n$\r$\nJika iya, silakan klik Berikutnya untuk menghapus ITS Maps Windows dari komputer Anda."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
