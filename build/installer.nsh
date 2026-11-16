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
