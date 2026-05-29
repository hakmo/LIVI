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
        } ]
      ]
    }
  ]
}
