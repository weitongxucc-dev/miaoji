; 秒记安装器：默认装到 D 盘，避免占用 C 盘空间。
; 用户在目录页仍可修改安装位置；如果电脑没有 D 盘，则保持 electron-builder 的默认位置。
!macro preInit
  IfFileExists "D:\*.*" 0 miaoji_no_drive
    SetRegView 64
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "D:\秒记"
    SetRegView 32
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "D:\秒记"
  miaoji_no_drive:
!macroend

; 安装完成后提示没有 Obsidian 的用户，只提示一次；静默安装不打扰。
!macro customInstall
  IfSilent miaoji_obs_done
  IfFileExists "$LOCALAPPDATA\Obsidian\Obsidian.exe" miaoji_obs_done
  ReadRegStr $0 HKCU "Software\Classes\obsidian\shell\open\command" ""
  StrCmp $0 "" 0 miaoji_obs_done
  ReadRegStr $1 HKCU "Software\Miaoji" "ObsidianPrompted"
  StrCmp $1 "" 0 miaoji_obs_done
  WriteRegStr HKCU "Software\Miaoji" "ObsidianPrompted" "1"
  MessageBox MB_YESNO|MB_ICONQUESTION "没有检测到 Obsidian。$\r$\n秒记可以把词条写进 Obsidian 笔记；没有安装也能单独使用。$\r$\n$\r$\n要现在打开 Obsidian 下载页吗？" IDNO miaoji_obs_done
  ExecShell "open" "https://obsidian.md/download"
  miaoji_obs_done:
!macroend
