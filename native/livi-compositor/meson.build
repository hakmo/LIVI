project('livi-compositor', 'c',
  default_options: ['c_std=c23,c2x', 'warning_level=1'])

# System wlroots-0.20 when present (Fedora dev box), else the pinned 0.20
# subproject. CI/Ubuntu and the Pi ship older wlroots, so the AppImage carries
# its own. Nested-only: empty backends + no session/xwayland drop DRM, libinput,
# libseat, udev and xcb. wlr_scene and linux-dmabuf stay (always compiled).
wlroots = dependency('wlroots-0.20',
  fallback: ['wlroots', 'wlroots'],
  default_options: [
    'backends=',
    'renderers=gles2',
    'allocators=gbm',
    'session=disabled',
    'xwayland=disabled',
    'color-management=disabled',
    'examples=false',
  ])
wayland_server = dependency('wayland-server')
xkbcommon = dependency('xkbcommon')
pixman = dependency('pixman-1')
cairo = dependency('cairo')

executable('livi-compositor',
  'livi-compositor.c',
  dependencies: [wlroots, wayland_server, xkbcommon, pixman, cairo],
  c_args: ['-DWLR_USE_UNSTABLE', '-D_GNU_SOURCE'],
  install: false)
