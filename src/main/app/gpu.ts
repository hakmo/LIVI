import { app } from 'electron'
import { linuxPresetAngleVulkan } from '../utils'

// Linux x64 -> ANGLE + Vulkan for the UI compositor
if (process.platform === 'linux' && process.arch === 'x64') {
  commonGpuToggles()
  if (process.env.LIVI_COMPOSITOR === '1') {
    app.commandLine.appendSwitch('use-gl', 'angle')
    app.commandLine.appendSwitch('use-angle', 'gl')
    app.commandLine.appendSwitch('disable-features', 'WaylandWindowDecorations')
  } else {
    linuxPresetAngleVulkan()
  }
}

// arm64/Pi: GPU toggles so Chromium composites on the V3D GPU
if (process.platform === 'linux' && process.arch !== 'x64') {
  commonGpuToggles()
}

export function commonGpuToggles() {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
}
