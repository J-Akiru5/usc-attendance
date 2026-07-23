<#
.SYNOPSIS
  Upload files to Supabase Storage via REST API.

.DESCRIPTION
  Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the .env file
  in the project root, then uploads one or more files to the specified bucket.

.PARAMETER FilePath
  Path to the file(s) to upload. Accepts wildcards.

.PARAMETER Bucket
  Target bucket name. Defaults to 'videos'.

.PARAMETER RemoteName
  Optional remote filename. If omitted, uses the local filename.

.EXAMPLE
  .\scripts\upload-to-supabase.ps1 -FilePath "C:\videos\trailer.mp4"

.EXAMPLE
  .\scripts\upload-to-supabase.ps1 -FilePath "C:\images\*.jpg" -Bucket "profiles"
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$FilePath,

  [string]$Bucket = "videos",

  [string]$RemoteName
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path "$scriptDir\.."
$envFile = Join-Path $projectRoot ".env"

if (-not (Test-Path $envFile)) {
  Write-Error ".env file not found at $envFile"
  exit 1
}

# Parse .env file
$envVars = @{}
Get-Content $envFile | Where-Object { $_ -match '^\s*([^#=]+?)\s*=\s*(.+?)\s*$' } | ForEach-Object {
  $envVars[$Matches[1]] = $Matches[2]
}

$supabaseUrl = $envVars['SUPABASE_URL']
$serviceRoleKey = $envVars['SUPABASE_SERVICE_ROLE_KEY']

if (-not $supabaseUrl -or -not $serviceRoleKey) {
  Write-Error "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env"
  exit 1
}

# Resolve file(s)
$files = Get-Item $FilePath -ErrorAction Stop
if ($files -isnot [array]) { $files = @($files) }

if ($files.Count -eq 0) {
  Write-Error "No files matched: $FilePath"
  exit 1
}

foreach ($file in $files) {
  $remoteName = if ($RemoteName -and $files.Count -eq 1) { $RemoteName } else { $file.Name }
  $mimeType = switch ($file.Extension.ToLower()) {
    '.mp4'  { 'video/mp4' }
    '.webm' { 'video/webm' }
    '.ogg'  { 'video/ogg' }
    '.ogv'  { 'video/ogg' }
    '.mov'  { 'video/quicktime' }
    '.jpg'  { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.png'  { 'image/png' }
    '.webp' { 'image/webp' }
    '.gif'  { 'image/gif' }
    '.avif' { 'image/avif' }
    default { 'application/octet-stream' }
  }

  $fileSizeMB = [math]::Round($file.Length / 1MB, 1)
  Write-Host "Uploading $($file.Name) ($fileSizeMB MB) -> $Bucket/$remoteName ..."

  $body = [System.IO.File]::ReadAllBytes($file.FullName)
  $uri = "$supabaseUrl/storage/v1/object/$Bucket/$remoteName"

  $headers = @{
    'Authorization' = "Bearer $serviceRoleKey"
    'Content-Type'  = $mimeType
  }

  try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body -ContentType $mimeType
    $publicUrl = "$supabaseUrl/storage/v1/object/public/$Bucket/$remoteName"
    Write-Host "  Uploaded: $publicUrl" -ForegroundColor Green
  }
  catch {
    Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host "`nDone." -ForegroundColor Green
Write-Host "Public URL format: $supabaseUrl/storage/v1/object/public/$Bucket/<filename>" -ForegroundColor Cyan
