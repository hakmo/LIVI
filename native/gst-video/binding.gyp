{
  "variables": {
    "gst_pc": "PKG_CONFIG_PATH=\"/Library/Frameworks/GStreamer.framework/Versions/1.0/lib/pkgconfig:${PKG_CONFIG_PATH}\" pkg-config gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0"
  },
  "targets": [
    {
      "target_name": "gst_video",
      "defines": [ "NAPI_VERSION=8" ],
      "conditions": [
        [ "OS=='mac'", {
          "sources": [ "src/gst_video.cc", "src/gst_video_mac.mm" ],
          "libraries": [
            "<!@(<(gst_pc) --libs)",
            "-framework Cocoa",
            "-framework QuartzCore"
          ],
          "xcode_settings": {
            "OTHER_CFLAGS": [ "<!@(<(gst_pc) --cflags)" ],
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          }
        } ],
        [ "OS=='linux'", {
          "sources": [ "src/gst_video.cc" ],
          "cflags": [ "<!@(pkg-config --cflags gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0)" ],
          "libraries": [ "<!@(pkg-config --libs gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0)" ]
        } ],
        [ "OS=='win'", {
          "sources": [ "src/gst_video.cc", "src/gst_video_win.cc" ],
          "include_dirs": [
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/include/gstreamer-1.0",
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/include/glib-2.0",
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/lib/glib-2.0/include"
          ],
          "libraries": [
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/lib/gstreamer-1.0.lib",
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/lib/gstapp-1.0.lib",
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/lib/gstvideo-1.0.lib",
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/lib/gstbase-1.0.lib",
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/lib/gobject-2.0.lib",
            "$(GSTREAMER_1_0_ROOT_MSVC_X86_64)/lib/glib-2.0.lib",
            "user32.lib",
            "gdi32.lib",
            "comctl32.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": { "ExceptionHandling": 1 }
          }
        } ]
      ]
    }
  ],
  "conditions": [
    [ "OS=='linux'", {
      "targets": [
        {
          # Standalone gst-host binary. Runs the pipeline outside the Electron
          # executable so system libwayland binds ffi_call to the system libffi,
          # not Electron's bundled copy (whose ffi_cif ABI differs and corrupts
          # wayland event marshalling on resize).
          "target_name": "livi-gst-host",
          "type": "executable",
          "defines": [ "LIVI_GST_HOST_STANDALONE" ],
          "sources": [ "src/gst_video.cc" ],
          "cflags": [ "<!@(pkg-config --cflags gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0)" ],
          "cflags_cc": [ "-std=c++17", "-fexceptions" ],
          "libraries": [ "<!@(pkg-config --libs gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0)" ]
        }
      ]
    } ]
  ]
}
