# Script de inicialização dev do Proton Flow (PowerShell / Windows)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
python "$ScriptDir\start_dev.py" @args
