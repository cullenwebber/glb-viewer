import AppKit
import Foundation
let directory = "assets/AppIcon.iconset"
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
  for scale in [1, 2] {
    let pixels = size * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let transform = NSAffineTransform(); transform.scale(by: CGFloat(pixels) / 1024); transform.concat()
    NSColor(red: 0.04, green: 0.04, blue: 0.04, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 40, y: 40, width: 944, height: 944), xRadius: 210, yRadius: 210).fill()
    let cube = NSBezierPath()
    cube.move(to: NSPoint(x: 512, y: 785)); cube.line(to: NSPoint(x: 755, y: 645)); cube.line(to: NSPoint(x: 755, y: 365)); cube.line(to: NSPoint(x: 512, y: 225)); cube.line(to: NSPoint(x: 269, y: 365)); cube.line(to: NSPoint(x: 269, y: 645)); cube.close()
    cube.move(to: NSPoint(x: 269, y: 645)); cube.line(to: NSPoint(x: 512, y: 505)); cube.line(to: NSPoint(x: 755, y: 645))
    cube.move(to: NSPoint(x: 512, y: 505)); cube.line(to: NSPoint(x: 512, y: 225))
    NSColor(red: 0.93, green: 0.93, blue: 0.93, alpha: 1).setStroke(); cube.lineWidth = 30; cube.lineJoinStyle = .round; cube.stroke()
    NSGraphicsContext.restoreGraphicsState()
    let suffix = scale == 2 ? "@2x" : ""
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(directory)/icon_\(size)x\(size)\(suffix).png"))
  }
}
