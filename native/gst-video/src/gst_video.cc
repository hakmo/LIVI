#include <node_api.h>
#include <gst/gst.h>
#include <gst/app/gstappsrc.h>
#include <gst/video/videooverlay.h>
#include <cstring>
#include <initializer_list>
#include <string>

// Native window attach is platform-specific; the macOS (Cocoa) implementation
// lives in gst_video_mac.mm. Non-mac uses the window handle directly
#ifdef __APPLE__
extern "C" guintptr livi_attach_view(guintptr parent, void** outView);
extern "C" void livi_remove_view(void* view);
extern "C" void livi_set_view_hidden(void* view, bool hidden);
#else
static guintptr livi_attach_view(guintptr parent, void** outView) {
  *outView = nullptr;
  return parent;
}
static void livi_remove_view(void*) {}
static void livi_set_view_hidden(void*, bool) {}
#endif

struct Player {
  GstElement* pipeline = nullptr;
  GstElement* appsrc = nullptr;
  GstElement* sink = nullptr;
  void* view = nullptr;
};

static void ensure_init() {
  static bool done = false;
  if (!done) {
    gst_init(NULL, NULL);
    done = true;
  }
}

static GstBusSyncReply bus_sync(GstBus*, GstMessage* msg, gpointer) {
  GstMessageType t = GST_MESSAGE_TYPE(msg);
  if (t == GST_MESSAGE_ERROR) {
    GError* e = nullptr; gchar* d = nullptr;
    gst_message_parse_error(msg, &e, &d);
    fprintf(stderr, "[gst_video] ERROR from %s: %s | %s\n",
      GST_OBJECT_NAME(msg->src), e ? e->message : "?", d ? d : "");
    if (e) g_error_free(e);
    g_free(d);
  } else if (t == GST_MESSAGE_WARNING) {
    GError* e = nullptr; gchar* d = nullptr;
    gst_message_parse_warning(msg, &e, &d);
    fprintf(stderr, "[gst_video] WARN from %s: %s | %s\n",
      GST_OBJECT_NAME(msg->src), e ? e->message : "?", d ? d : "");
    if (e) g_error_free(e);
    g_free(d);
  }
  return GST_BUS_PASS;
}

// Force every base sink in the pipeline to render unsynced (live, drop-late)
static void force_sinks_realtime(GstElement* pipeline) {
  GstIterator* it = gst_bin_iterate_recurse(GST_BIN(pipeline));
  GValue item = G_VALUE_INIT;
  gboolean done = FALSE;
  while (!done) {
    switch (gst_iterator_next(it, &item)) {
      case GST_ITERATOR_OK: {
        GstElement* el = GST_ELEMENT(g_value_get_object(&item));
        if (GST_IS_BASE_SINK(el)) {
          g_object_set(el, "sync", FALSE, "qos", FALSE, "max-lateness", (gint64)0, NULL);
        }
        g_value_reset(&item);
        break;
      }
      case GST_ITERATOR_RESYNC:
        gst_iterator_resync(it);
        break;
      case GST_ITERATOR_ERROR:
      case GST_ITERATOR_DONE:
        done = TRUE;
        break;
    }
  }
  g_value_unset(&item);
  gst_iterator_free(it);
}

// Log the decoded video caps once (format + memory) to diagnose the path
static GstPadProbeReturn caps_probe(GstPad*, GstPadProbeInfo* info, gpointer) {
  GstEvent* ev = GST_PAD_PROBE_INFO_EVENT(info);
  if (ev && GST_EVENT_TYPE(ev) == GST_EVENT_CAPS) {
    GstCaps* caps = nullptr;
    gst_event_parse_caps(ev, &caps);
    gchar* s = gst_caps_to_string(caps);
    fprintf(stderr, "[gst_video] decoded caps: %s\n", s ? s : "?");
    g_free(s);
    return GST_PAD_PROBE_REMOVE;
  }
  return GST_PAD_PROBE_OK;
}

static void remove_video_view(Player* p) {
  if (p->view) {
    livi_remove_view(p->view);
    p->view = nullptr;
  }
}

static const char* parser_for(const std::string& c) {
  if (c == "h265") return "h265parse";
  if (c == "vp9") return "vp9parse";
  if (c == "av1") return "av1parse";
  return "h264parse";
}

// First decoder in the list whose factory is registered; falls back to the
// last entry (software) so the pipeline string is still valid.
static const char* pick_decoder(std::initializer_list<const char*> cands) {
  const char* last = "";
  for (const char* c : cands) {
    last = c;
    GstElementFactory* f = gst_element_factory_find(c);
    if (f) {
      gst_object_unref(f);
      return c;
    }
  }
  return last;
}

// Software decoders (everything else — vtdec/v4l2*/va*/d3d11* — is HW)
static bool is_hw_decoder(const char* name) {
  if (!name || !*name) return false;
  if (strncmp(name, "avdec_", 6) == 0) return false;
  if (strcmp(name, "vp9dec") == 0 || strcmp(name, "vp8dec") == 0) return false;
  if (strcmp(name, "dav1ddec") == 0 || strcmp(name, "openh264dec") == 0) return false;
  return true;
}

// Best available decoder per codec, HW-first then software fallback. Adapts at
// runtime: Pi5 stateless v4l2sl, Pi4 v4l2, x86 VA-API, mac vtdec, win d3d11
static const char* decoder_for(const std::string& c) {
  if (getenv("LIVI_GST_SWDEC")) {
    if (c == "h265") return "avdec_h265";
    if (c == "vp9") return "vp9dec";
    if (c == "av1") return "dav1ddec";
    return "avdec_h264";
  }
#ifdef __APPLE__
  if (c == "h265") return pick_decoder({"vtdec", "avdec_h265"});
  if (c == "vp9") return pick_decoder({"vp9dec"});
  if (c == "av1") return pick_decoder({"dav1ddec"});
  return pick_decoder({"vtdec", "avdec_h264"});
#elif defined(_WIN32)
  if (c == "h265") return pick_decoder({"d3d11h265dec", "avdec_h265"});
  if (c == "vp9") return pick_decoder({"d3d11vp9dec", "vp9dec"});
  if (c == "av1") return pick_decoder({"d3d11av1dec", "dav1ddec"});
  return pick_decoder({"d3d11h264dec", "avdec_h264"});
#else
  if (c == "h265") return pick_decoder({"v4l2slh265dec", "v4l2h265dec", "vah265dec", "avdec_h265"});
  if (c == "vp9") return pick_decoder({"v4l2slvp9dec", "v4l2vp9dec", "vavp9dec", "vp9dec"});
  if (c == "av1") return pick_decoder({"vaav1dec", "dav1ddec"});
  return pick_decoder({"v4l2slh264dec", "v4l2h264dec", "vah264dec", "avdec_h264"});
#endif
}

// Render sink per platform. Linux render path (Wayland/DRM) refined on-device.
static const char* sink_for() {
#ifdef _WIN32
  return "d3d11videosink";
#else
  return "glimagesink";
#endif
}

static std::string caps_for(const std::string& c) {
  if (c == "h265") return "video/x-h265,stream-format=byte-stream";
  if (c == "vp9") return "video/x-vp9";
  if (c == "av1") return "video/x-av1";
  return "video/x-h264,stream-format=byte-stream";
}

static std::string get_string_arg(napi_env env, napi_value v) {
  size_t len = 0;
  napi_get_value_string_utf8(env, v, NULL, 0, &len);
  std::string s(len, '\0');
  napi_get_value_string_utf8(env, v, &s[0], len + 1, &len);
  return s;
}

static napi_value Version(napi_env env, napi_callback_info info) {
  ensure_init();
  gchar* v = gst_version_string();
  napi_value result;
  napi_create_string_utf8(env, v, NAPI_AUTO_LENGTH, &result);
  g_free(v);
  return result;
}

// probeCodecs() -> { h264: {available, hw}, h265: {...}, vp9, av1 }
// available = a decoder exists; hw = the chosen decoder is hardware-accelerated
static napi_value ProbeCodecs(napi_env env, napi_callback_info info) {
  ensure_init();
  napi_value obj;
  napi_create_object(env, &obj);
  const char* codecs[] = {"h264", "h265", "vp9", "av1"};
  for (const char* c : codecs) {
    const char* dec = decoder_for(c);
    GstElementFactory* f = gst_element_factory_find(dec);
    bool available = (f != nullptr);
    if (f) gst_object_unref(f);
    bool hw = available && is_hw_decoder(dec);

    napi_value entry, b;
    napi_create_object(env, &entry);
    napi_get_boolean(env, available, &b);
    napi_set_named_property(env, entry, "available", b);
    napi_get_boolean(env, hw, &b);
    napi_set_named_property(env, entry, "hw", b);
    napi_set_named_property(env, obj, c, entry);
  }
  return obj;
}

static void player_finalize(napi_env env, void* data, void* hint) {
  Player* p = static_cast<Player*>(data);
  if (!p) return;
  if (p->pipeline) {
    gst_element_set_state(p->pipeline, GST_STATE_NULL);
    if (p->appsrc) gst_object_unref(p->appsrc);
    if (p->sink) gst_object_unref(p->sink);
    gst_object_unref(p->pipeline);
  }
  remove_video_view(p);
  delete p;
}

// createPlayer(codec: string, windowHandle: Buffer) -> external
static napi_value CreatePlayer(napi_env env, napi_callback_info info) {
  ensure_init();

  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

  std::string codec = argc >= 1 ? get_string_arg(env, argv[0]) : "h264";

  guintptr handle = 0;
  if (argc >= 2) {
    void* data = nullptr;
    size_t len = 0;
    if (napi_get_buffer_info(env, argv[1], &data, &len) == napi_ok && data && len >= sizeof(void*)) {
      memcpy(&handle, data, sizeof(void*));
    }
  }

  // Live low-latency
  std::string desc = "appsrc name=src is-live=true do-timestamp=true format=time"
    " min-latency=0 max-latency=0 caps=" +
    caps_for(codec) + " ! " + parser_for(codec) + " ! " + decoder_for(codec) + " name=dec" +
    " ! queue max-size-buffers=1 max-size-bytes=0 max-size-time=0 leaky=downstream" +
    " ! " + sink_for() + " name=sink sync=false qos=false";

  fprintf(stderr, "[gst_video] codec=%s decoder=%s | %s\n",
    codec.c_str(), decoder_for(codec), desc.c_str());

  GError* err = nullptr;
  GstElement* pipeline = gst_parse_launch(desc.c_str(), &err);
  if (!pipeline || err) {
    if (err) g_error_free(err);
    napi_value n;
    napi_get_null(env, &n);
    return n;
  }

  Player* p = new Player();
  p->pipeline = pipeline;
  p->appsrc = gst_bin_get_by_name(GST_BIN(pipeline), "src");
  p->sink = gst_bin_get_by_name(GST_BIN(pipeline), "sink");

  force_sinks_realtime(pipeline);

  GstElement* dec = gst_bin_get_by_name(GST_BIN(pipeline), "dec");
  if (dec) {
    GstPad* sp = gst_element_get_static_pad(dec, "src");
    if (sp) {
      gst_pad_add_probe(sp, GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM, caps_probe, NULL, NULL);
      gst_object_unref(sp);
    }
    gst_object_unref(dec);
  }

  GstBus* bus = gst_element_get_bus(pipeline);
  gst_bus_set_sync_handler(bus, bus_sync, NULL, NULL);
  gst_object_unref(bus);

  // Render into a hit-test-transparent host view (mac) on top of the hidden UI
  guintptr overlay = handle ? livi_attach_view(handle, &p->view) : handle;

  if (p->sink && GST_IS_VIDEO_OVERLAY(p->sink) && overlay) {
    gst_video_overlay_set_window_handle(GST_VIDEO_OVERLAY(p->sink), overlay);
  }

  napi_value ext;
  napi_create_external(env, p, player_finalize, NULL, &ext);
  return ext;
}

static Player* unwrap(napi_env env, napi_value v) {
  void* data = nullptr;
  napi_get_value_external(env, v, &data);
  return static_cast<Player*>(data);
}

static napi_value Start(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  Player* p = argc >= 1 ? unwrap(env, argv[0]) : nullptr;
  if (p && p->pipeline) gst_element_set_state(p->pipeline, GST_STATE_PLAYING);
  napi_value undef;
  napi_get_undefined(env, &undef);
  return undef;
}

// pushBuffer(player, buffer)
static napi_value PushBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  Player* p = argc >= 1 ? unwrap(env, argv[0]) : nullptr;

  napi_value result;
  if (!p || !p->appsrc || argc < 2) {
    napi_get_boolean(env, false, &result);
    return result;
  }

  void* data = nullptr;
  size_t len = 0;
  if (napi_get_buffer_info(env, argv[1], &data, &len) != napi_ok || !data || len == 0) {
    napi_get_boolean(env, false, &result);
    return result;
  }

  GstBuffer* buf = gst_buffer_new_memdup(data, len);
  GstFlowReturn ret = gst_app_src_push_buffer(GST_APP_SRC(p->appsrc), buf);
  napi_get_boolean(env, ret == GST_FLOW_OK, &result);
  return result;
}

// setVisible(player, bool): show/hide the video view (UI navigation in/out)
static napi_value SetVisible(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  Player* p = argc >= 1 ? unwrap(env, argv[0]) : nullptr;
  bool visible = true;
  if (argc >= 2) napi_get_value_bool(env, argv[1], &visible);
  if (p) livi_set_view_hidden(p->view, !visible);
  napi_value undef;
  napi_get_undefined(env, &undef);
  return undef;
}

static napi_value Stop(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  Player* p = argc >= 1 ? unwrap(env, argv[0]) : nullptr;
  if (p && p->pipeline) gst_element_set_state(p->pipeline, GST_STATE_NULL);
  if (p) remove_video_view(p);
  napi_value undef;
  napi_get_undefined(env, &undef);
  return undef;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "version", NAPI_AUTO_LENGTH, Version, NULL, &fn);
  napi_set_named_property(env, exports, "version", fn);
  napi_create_function(env, "probeCodecs", NAPI_AUTO_LENGTH, ProbeCodecs, NULL, &fn);
  napi_set_named_property(env, exports, "probeCodecs", fn);
  napi_create_function(env, "createPlayer", NAPI_AUTO_LENGTH, CreatePlayer, NULL, &fn);
  napi_set_named_property(env, exports, "createPlayer", fn);
  napi_create_function(env, "start", NAPI_AUTO_LENGTH, Start, NULL, &fn);
  napi_set_named_property(env, exports, "start", fn);
  napi_create_function(env, "pushBuffer", NAPI_AUTO_LENGTH, PushBuffer, NULL, &fn);
  napi_set_named_property(env, exports, "pushBuffer", fn);
  napi_create_function(env, "setVisible", NAPI_AUTO_LENGTH, SetVisible, NULL, &fn);
  napi_set_named_property(env, exports, "setVisible", fn);
  napi_create_function(env, "stop", NAPI_AUTO_LENGTH, Stop, NULL, &fn);
  napi_set_named_property(env, exports, "stop", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
