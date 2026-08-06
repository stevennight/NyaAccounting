[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$keystorePath = Join-Path $root 'android\keystores\nya-accounting-release.jks'
$backupPath = Join-Path $root '.workspace\release\android\nya-accounting-release.jks'
$propertiesPath = Join-Path $root 'android\key.properties'

$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
  throw 'keytool was not found. Install a JDK or set PATH before generating the Android release keystore.'
}

$existingPaths = @($keystorePath, $backupPath, $propertiesPath) |
  Where-Object { Test-Path -LiteralPath $_ }
if ($existingPaths.Count -gt 0 -and -not $Force) {
  throw "Signing material already exists: $($existingPaths -join ', '). Use -Force only when intentionally rotating the key."
}

function New-RandomPassword {
  $bytes = [byte[]]::new(32)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$storePassword = New-RandomPassword
$keyPassword = $storePassword
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keystorePath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupPath) | Out-Null

& $keytool.Source `
  -genkeypair `
  -v `
  -keystore $keystorePath `
  -storetype PKCS12 `
  -alias 'nya-accounting' `
  -keyalg RSA `
  -keysize 4096 `
  -validity 9125 `
  -storepass $storePassword `
  -keypass $keyPassword `
  -dname 'CN=Nya Accounting, OU=Self Hosted, O=Nya Accounting, L=Local, S=Local, C=CN'
if ($LASTEXITCODE -ne 0) {
  throw "keytool failed with exit code $LASTEXITCODE"
}

Copy-Item -LiteralPath $keystorePath -Destination $backupPath -Force
$properties = @(
  'storeFile=keystores/nya-accounting-release.jks'
  "storePassword=$storePassword"
  'keyAlias=nya-accounting'
  "keyPassword=$keyPassword"
)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $propertiesPath) | Out-Null
$properties | Set-Content -LiteralPath $propertiesPath -Encoding utf8

Write-Host "Android release keystore: $keystorePath"
Write-Host "Android keystore backup: $backupPath"
Write-Host "Android signing properties: $propertiesPath"
Write-Host 'Back up these files securely. Losing the keystore prevents installed Android clients from upgrading.'
