param(
  [string]$Bundle = "assets/gstreamer/windows-x64"
)

$ErrorActionPreference = "Stop"

$env:PATH = "$(Join-Path $Bundle 'bin');$env:PATH"
$env:GST_PLUGIN_PATH_1_0 = Join-Path $Bundle 'lib\gstreamer-1.0'
$env:GST_PLUGIN_SYSTEM_PATH_1_0 = Join-Path $Bundle 'lib\gstreamer-1.0'

$scanner = Join-Path $Bundle 'libexec\gstreamer-1.0\gst-plugin-scanner.exe'
if (Test-Path -LiteralPath $scanner) {
  $env:GST_PLUGIN_SCANNER_1_0 = $scanner
}

$launch = Join-Path $Bundle 'bin\gst-launch-1.0.exe'
$inspect = Join-Path $Bundle 'bin\gst-inspect-1.0.exe'

& $launch --version
& $inspect coreelements | Out-Null
& $launch fakesrc num-buffers=1 ! fakesink
& (Join-Path $Bundle 'bin\gst-device-monitor-1.0.exe') --version

# Video parse/convert must load. The video sinks (d3d11videosink, glimagesink)
# need a GPU/D3D11 device or ANGLE and cannot register on a headless CI runner,
# so they are report-only here, they work on a real Windows machine
foreach ($el in @('h264parse', 'h265parse', 'videoconvert', 'videoscale')) {
  & $inspect $el | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Error "FAIL $el"
    exit 1
  }
  Write-Host "ok   $el"
}

# Sinks + HW decoders are GPU/driver-dependent (report only)
foreach ($el in @('d3d11videosink', 'd3d11h264dec', 'd3d11h265dec', 'glimagesink')) {
  & $inspect $el | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "hw   $el"
  } else {
    Write-Host "--   $el (not present)"
  }
}

# The report-only loop leaves a non-zero $LASTEXITCODE from the last missing
# element. The GitHub pwsh wrapper appends `exit $LASTEXITCODE`, so end clean.
exit 0
