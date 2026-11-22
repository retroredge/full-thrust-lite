// Run: swift tools/extract-art/preview.swift <in.png> <out.png> [scale=2] [r g b background 0-255]  -- composites an RGBA PNG on a solid colour for inspection
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let s = a.count > 3 ? Double(a[3])! : 2
let bg = a.count > 6 ? [Double(a[4])!, Double(a[5])!, Double(a[6])!] : [255.0, 0, 255]
let w = Int(Double(img.width) * s), h = Int(Double(img.height) * s)
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: bg[0] / 255, green: bg[1] / 255, blue: bg[2] / 255, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
ctx.interpolationQuality = .none
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(d, ctx.makeImage()!, nil); CGImageDestinationFinalize(d)
