#include <gst/gst.h>
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>

// Hit-test-transparent host view so pointer/touch events fall through to the
// web UI below (which forwards them to the phone)
@interface LIVIVideoView : NSView
@end
@implementation LIVIVideoView
- (NSView*)hitTest:(NSPoint)point {
  return nil;
}
@end

extern "C" guintptr livi_attach_view(guintptr parent, void** outView) {
  *outView = nullptr;
  NSView* p = (NSView*)(void*)parent;
  if (!p) return parent;
  LIVIVideoView* v = [[LIVIVideoView alloc] initWithFrame:[p bounds]];
  [v setWantsLayer:YES];
  v.layer.backgroundColor = CGColorGetConstantColor(kCGColorBlack);
  [v setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
  [p addSubview:v];
  *outView = (void*)v;
  return (guintptr)(void*)v;
}

extern "C" void livi_remove_view(void* view) {
  if (!view) return;
  NSView* v = (NSView*)view;
  [v removeFromSuperview];
}

extern "C" void livi_set_view_hidden(void* view, bool hidden) {
  if (!view) return;
  NSView* v = (NSView*)view;
  [v setHidden:hidden];
}
