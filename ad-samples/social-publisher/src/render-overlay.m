#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreText/CoreText.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>

static CGColorRef CreateColor(CGFloat red, CGFloat green, CGFloat blue, CGFloat alpha) {
  return CGColorCreateGenericRGB(red / 255.0, green / 255.0, blue / 255.0, alpha);
}

static void FillRect(CGContextRef context, CGFloat x, CGFloat y, CGFloat width, CGFloat height, CGColorRef color) {
  CGContextSetFillColorWithColor(context, color);
  CGContextFillRect(context, CGRectMake(x, y, width, height));
}

static void DrawLines(CGContextRef context, NSArray<NSString *> *lines, CGFloat x, CGFloat y, CGFloat size, CGFloat lineHeight, NSFontWeight weight, CGColorRef color, CGFloat kern) {
  NSFont *font = [NSFont systemFontOfSize:size weight:weight];
  CTFontRef ctFont = CTFontCreateWithName((__bridge CFStringRef)[font fontName], size, NULL);
  NSDictionary *attributes = @{
    (__bridge id)kCTFontAttributeName: (__bridge id)ctFont,
    (__bridge id)kCTForegroundColorAttributeName: (__bridge id)color,
    (__bridge id)kCTKernAttributeName: @(kern)
  };

  [lines enumerateObjectsUsingBlock:^(NSString *line, NSUInteger index, BOOL *stop) {
    CGFloat lineY = y + (CGFloat)([lines count] - 1 - index) * lineHeight;
    NSAttributedString *attributedLine = [[NSAttributedString alloc] initWithString:line attributes:attributes];
    CTLineRef ctLine = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)attributedLine);
    CGContextSetTextPosition(context, x, lineY);
    CTLineDraw(ctLine, context);
    CFRelease(ctLine);
  }];
  CFRelease(ctFont);
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 3) {
      fprintf(stderr, "Usage: render-overlay <payload.json> <output.png>\n");
      return 64;
    }

    NSString *payloadPath = [NSString stringWithUTF8String:argv[1]];
    NSString *outputPath = [NSString stringWithUTF8String:argv[2]];
    NSData *payloadData = [NSData dataWithContentsOfFile:payloadPath];
    if (!payloadData) {
      fprintf(stderr, "Unable to read overlay payload\n");
      return 66;
    }

    NSError *error = nil;
    NSDictionary *payload = [NSJSONSerialization JSONObjectWithData:payloadData options:0 error:&error];
    if (!payload || error) {
      fprintf(stderr, "Unable to parse overlay payload\n");
      return 65;
    }

    NSArray<NSString *> *titleLines = payload[@"titleLines"] ?: @[];
    NSArray<NSString *> *kickerLines = payload[@"kickerLines"] ?: @[];
    NSArray<NSString *> *footerLines = payload[@"footerLines"] ?: @[];
    CGFloat titleFontSize = [payload[@"titleFontSize"] doubleValue] ?: 78.0;
    const size_t width = 1080;
    const size_t height = 1920;
    const size_t bytesPerRow = width * 4;

    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    void *pixels = calloc(height, bytesPerRow);
    CGContextRef context = CGBitmapContextCreate(
      pixels,
      width,
      height,
      8,
      bytesPerRow,
      colorSpace,
      kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
    );
    if (!context) {
      fprintf(stderr, "Unable to create bitmap context\n");
      return 70;
    }

    CGContextClearRect(context, CGRectMake(0, 0, width, height));
    CGContextSetShouldAntialias(context, true);
    CGContextSetAllowsAntialiasing(context, true);
    CGContextSetTextMatrix(context, CGAffineTransformIdentity);

    CGColorRef panelColor = CreateColor(4, 8, 12, 0.86);
    CGColorRef gold = CreateColor(216, 184, 95, 1.0);
    CGColorRef white = CreateColor(248, 250, 252, 1.0);
    CGColorRef muted = CreateColor(190, 201, 214, 1.0);

    FillRect(context, 42, height - 78 - 430, 996, 430, panelColor);
    FillRect(context, 76, height - 109, 928, 7, gold);

    if ([kickerLines count] > 0) {
      DrawLines(context, kickerLines, 76, height - 178, 31, 38, NSFontWeightBold, gold, 1.2);
    }

    DrawLines(
      context,
      titleLines,
      76,
      height - ([kickerLines count] == 0 ? 318 : 408),
      titleFontSize,
      titleFontSize * 0.96,
      NSFontWeightBlack,
      white,
      0
    );

    if ([footerLines count] > 0) {
      FillRect(context, 64, height - 1518 - 124, 952, 124, panelColor);
      DrawLines(context, footerLines, 92, height - 1598, 34, 44, NSFontWeightSemibold, muted, 0);
    }

    CGImageRef image = CGBitmapContextCreateImage(context);
    NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
    CGImageDestinationRef destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)outputURL, CFSTR("public.png"), 1, NULL);
    if (!destination || !image) {
      fprintf(stderr, "Unable to create PNG destination\n");
      return 71;
    }
    CGImageDestinationAddImage(destination, image, nil);
    if (!CGImageDestinationFinalize(destination)) {
      fprintf(stderr, "Unable to write PNG overlay\n");
      return 72;
    }

    CFRelease(destination);
    CGImageRelease(image);
    CGColorRelease(panelColor);
    CGColorRelease(gold);
    CGColorRelease(white);
    CGColorRelease(muted);
    CGContextRelease(context);
    CGColorSpaceRelease(colorSpace);
    free(pixels);
  }
  return 0;
}
