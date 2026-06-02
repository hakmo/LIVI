#include <gst/gst.h>
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#include <math.h>

// Clip view: sized to the AA content rectangle (the user-chosen AR the phone renders
// inside the 16:9 transport tier), centered in the window, clipping its child
@interface LIVIClipView : NSView {
@public
  NSView* _gl;  // the GL sink's render target (child view)
  double _cropL, _cropT, _visW, _visH, _tierW, _tierH;  // content region in tier px
}
- (void)relayout;
@end

@implementation LIVIClipView
- (NSView*)hitTest:(NSPoint)point {
  return nil;
}

- (void)relayout {
  NSView* sv = [self superview];
  if (!sv) return;
  const double ww = sv.bounds.size.width;
  const double wh = sv.bounds.size.height;
  if (ww <= 0 || wh <= 0) return;

  // No content region yet: fill the window, child fills the clip view.
  if (_visW <= 0 || _visH <= 0 || _tierW <= 0 || _tierH <= 0) {
    [self setFrame:sv.bounds];
    [_gl setFrame:self.bounds];
    return;
  }

  // Contain the content AR into the window; the clip view IS that content rect.
  const double scale = fmin(ww / _visW, wh / _visH);
  const double cdw = _visW * scale;
  const double cdh = _visH * scale;
  [self setFrame:NSMakeRect((ww - cdw) / 2.0, (wh - cdh) / 2.0, cdw, cdh)];

  // Child = whole tier scaled by `scale`, shifted so the content (at cropL/cropT inside
  // the tier) sits at the clip origin. The clip view bounds clip the margins
  [_gl setFrame:NSMakeRect(-_cropL * scale, -_cropT * scale, _tierW * scale, _tierH * scale)];
}

- (void)superviewResized:(NSNotification*)note {
  (void)note;
  [self relayout];
}
@end

extern "C" guintptr livi_attach_view(guintptr parent, void** outView) {
  *outView = nullptr;
  NSView* p = (NSView*)(void*)parent;
  if (!p) return parent;

  LIVIClipView* clip = [[LIVIClipView alloc] initWithFrame:[p bounds]];
  clip->_gl = nullptr;
  clip->_cropL = clip->_cropT = clip->_visW = clip->_visH = clip->_tierW = clip->_tierH = 0;
  [clip setWantsLayer:YES];
  clip.layer.backgroundColor = CGColorGetConstantColor(kCGColorBlack);
  clip.layer.masksToBounds = YES;
  [p addSubview:clip];

  NSView* gl = [[NSView alloc] initWithFrame:[clip bounds]];
  [gl setWantsLayer:YES];
  [clip addSubview:gl];
  clip->_gl = gl;

  // Re-lay-out whenever the window (content view) resizes.
  [p setPostsFrameChangedNotifications:YES];
  [[NSNotificationCenter defaultCenter] addObserver:clip
                                           selector:@selector(superviewResized:)
                                               name:NSViewFrameDidChangeNotification
                                             object:p];

  *outView = (void*)clip;       // tracked view; region/hide/remove operate on the clip
  return (guintptr)(void*)gl;   // the GL sink renders into the child
}

// Set the AA content region (crop offsets + visible size within the decoded tier) and
// re-lay-out. cropL=0/visW=0 disables cropping (child fills the window)
extern "C" void livi_set_content_region(void* view, void* sink, double cropL,
    double cropT, double visW, double visH, double tierW, double tierH) {
  (void)sink;
  if (!view) return;
  LIVIClipView* clip = (LIVIClipView*)view;
  clip->_cropL = cropL;
  clip->_cropT = cropT;
  clip->_visW = visW;
  clip->_visH = visH;
  clip->_tierW = tierW;
  clip->_tierH = tierH;
  [clip relayout];
}

extern "C" void livi_remove_view(void* view) {
  if (!view) return;
  NSView* v = (NSView*)view;
  [[NSNotificationCenter defaultCenter] removeObserver:v];
  [v removeFromSuperview];
}

extern "C" void livi_set_view_hidden(void* view, bool hidden) {
  if (!view) return;
  NSView* v = (NSView*)view;
  [v setHidden:hidden];
}
