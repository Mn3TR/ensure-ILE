; Check the exact app process before launching the quit handoff. This preserves
; the #469 fix: unrelated helpers under $INSTDIR must never block an upgrade.
Var pid

!macro customCheckAppRunning
  ${if} ${isUpdated}
  ${andIfNot} ${Silent}
    ; Ensure the installer progress window is visible and focused even when an
    ; older updater (<= 2.0.18-next) spawned the installer with windowsHide: true.
    ShowWindow $HWNDPARENT ${SW_SHOW}
    BringToFront
  ${endIf}
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 != 0
    Goto dsh_installer_app_stopped
  ${endIf}

  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 dsh_installer_scoped_fallback
    ; Newer versions receive this through Electron's single-instance channel.
    ; 2.0.2 ignores it, so the scoped builder fallback remains necessary for
    ; the first upgrade to a version that supports orderly shutdown.
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --dsh-installer-quit'
    StrCpy $R1 0

  dsh_installer_wait_for_exit:
    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 != 0
      Goto dsh_installer_app_stopped
    ${endIf}
    IntOp $R1 $R1 + 1
    ; Slow disks, antivirus hooks, and a large physical runtime can keep the
    ; process alive after Cordis disposal begins. Give the orderly handoff a
    ; full 30 seconds before escalating to the scoped forced-close path.
    ${if} $R1 < 60
      Sleep 500
      Goto dsh_installer_wait_for_exit
    ${endIf}

  dsh_installer_scoped_fallback:
    ; The patched builder macros match ensure-ILE.exe, not every executable
    ; below $INSTDIR. They handle pre-handoff releases and stubborn processes.
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK dsh_installer_stop_app
    Quit

  dsh_installer_stop_app:
    DetailPrint "$(appClosing)"
    ; KILL_PROCESS's tasklist fallback excludes $pid. The installer never has
    ; the application executable name, so zero is a safe sentinel here.
    StrCpy $pid 0
    !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
    Sleep 500
    StrCpy $R1 0

  dsh_installer_wait_for_fallback:
    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 != 0
      Goto dsh_installer_app_stopped
    ${endIf}
    IntOp $R1 $R1 + 1
    ${if} $R1 > 1
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY dsh_installer_wait_for_fallback
      Quit
    ${endIf}
    Sleep 1000
    !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
    Sleep 500
    Goto dsh_installer_wait_for_fallback

  dsh_installer_app_stopped:
!macroend

; ensure-ILE keeps learner data ($INSTDIR\.ensure-ile: problem bank, memory,
; student profile) inside the application directory. Every overwrite install
; first runs the previously installed uninstaller, which removes $INSTDIR
; recursively. Park the data in $TEMP while the marker file exists and restore it
; from customInstall. A plain uninstall carries no marker, so it still clears
; everything, exactly as before.
!macro customUnInstall
  ${if} ${FileExists} "$TEMP\ensure-ILE-upgrade.flag"
  ${andIf} ${FileExists} "$INSTDIR\.ensure-ile\*.*"
    RMDir /r "$TEMP\ensure-ILE-data"
    Rename "$INSTDIR\.ensure-ile" "$TEMP\ensure-ILE-data"
  ${endIf}
!macroend

; Override /S when an older updater (<= 2.0.18-next) launches an in-app update
; with ['/S', '--updated', '--force-run'], so the new installer still displays
; the visible extraction progress window.
!macro customInit
  !ifndef BUILD_UNINSTALLER
    ; Mark an overwrite install. The previously installed uninstaller parks
    ; learner data instead of deleting it when this marker exists.
    FileOpen $9 "$TEMP\ensure-ILE-upgrade.flag" w
    FileClose $9

    ${if} ${isUpdated}
    ${andIf} ${isForceRun}
      SetSilent normal
    ${endIf}
  !endif
!macroend

; Skip the install-mode wizard page during in-app updates while preserving
; the existing per-machine or per-user installation scope, so the installer
; opens directly to the visible extraction progress window.
!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ${if} ${isUpdated}
      ${if} $hasPerMachineInstallation == "1"
      ${andIf} $hasPerUserInstallation == "0"
        StrCpy $isForceMachineInstall "1"
      ${else}
        StrCpy $isForceCurrentInstall "1"
      ${endIf}
    ${endIf}
  !endif
!macroend

; When launched visibly by an in-app update (--updated --force-run), relaunch
; the updated application and close the installer as soon as extraction finishes
; without stopping on the Finish wizard page.
!macro customInstall
  ; Put back the learner data the previous uninstaller parked for us.
  Delete "$TEMP\ensure-ILE-upgrade.flag"
  ${if} ${FileExists} "$TEMP\ensure-ILE-data\*.*"
    RMDir /r "$INSTDIR\.ensure-ile"
    Rename "$TEMP\ensure-ILE-data" "$INSTDIR\.ensure-ile"
  ${endIf}

  ${if} ${isUpdated}
  ${andIf} ${isForceRun}
  ${andIfNot} ${Silent}
    HideWindow
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
    !insertmacro quitSuccess
  ${endIf}
!macroend
