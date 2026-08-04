# GICC compatibility shim for gpt-in-claude-code. The canonical command is gicc.
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'gicc.ps1'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    [Console]::Error.WriteLine("claudex: missing canonical GICC launcher: $launcher")
    exit 1
}
& $launcher @args
exit $LASTEXITCODE
