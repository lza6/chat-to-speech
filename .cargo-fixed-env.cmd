@echo off
rem ChatTTS desktop 构建环境（Windows + VS18 MSVC + Windows SDK 10.0.22621）
set "PATH=%PATH%;C:\Users\Administrator.DESKTOP-EGNE9ND\.cargo\bin"
set "VC=C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.50.35717"
set "SDK=C:\Program Files (x86)\Windows Kits\10"
set "SDKVER=10.0.22621.0"
set "INCLUDE=%VC%\include;%SDK%\Include\%SDKVER%\ucrt;%SDK%\Include\%SDKVER%\um;%SDK%\Include\%SDKVER%\shared"
set "LIB=%VC%\lib\x64;%SDK%\Lib\%SDKVER%\ucrt\x64;%SDK%\Lib\%SDKVER%\um\x64"
set "PATH=%PATH%;%VC%\bin\Hostx64\x64;%SDK%\bin\%SDKVER%\x64"
