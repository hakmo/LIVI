const path = require('path')

const addonPath = path.join(__dirname, 'build', 'Release', 'gst_video.node')

if (process.platform === 'linux') {
  // Load deep-bound so GStreamer's libgobject resolves ffi_call to the system libffi it was built
  // against, not Electron's bundled libffi (their ffi_cif layouts differ and crash when a GObject
  // signal is marshalled).
  const os = require('os')
  const dl = os.constants.dlopen
  const mod = { exports: {} }
  process.dlopen(mod, addonPath, dl.RTLD_LAZY | dl.RTLD_DEEPBIND)
  module.exports = mod.exports
} else {
  module.exports = require(addonPath)
}
