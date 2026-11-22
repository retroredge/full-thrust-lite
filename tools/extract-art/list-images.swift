// Run: swift tools/extract-art/list-images.swift <pdf> <page(1-based)> [outDir]  -- lists (and optionally dumps) image XObjects, recursing into Form XObjects
import Foundation
import CoreGraphics

let args = CommandLine.arguments
let pdf = CGPDFDocument(URL(fileURLWithPath: args[1]) as CFURL)!
let pageNo = Int(args[2])!
let outDir: String? = args.count > 3 ? args[3] : nil
let page = pdf.page(at: pageNo)!

func name(_ d: CGPDFDictionaryRef, _ k: String) -> String? {
    var p: UnsafePointer<CChar>? = nil
    if CGPDFDictionaryGetName(d, k, &p), let p = p { return String(cString: p) }
    return nil
}
func int(_ d: CGPDFDictionaryRef, _ k: String) -> Int {
    var v: CGPDFInteger = 0
    return CGPDFDictionaryGetInteger(d, k, &v) ? Int(v) : -1
}
func filterOf(_ d: CGPDFDictionaryRef) -> String {
    if let n = name(d, "Filter") { return n }
    var arr: CGPDFArrayRef? = nil
    if CGPDFDictionaryGetArray(d, "Filter", &arr), let arr = arr {
        var s: [String] = []
        for i in 0..<CGPDFArrayGetCount(arr) {
            var p: UnsafePointer<CChar>? = nil
            if CGPDFArrayGetName(arr, i, &p), let p = p { s.append(String(cString: p)) }
        }
        return s.joined(separator: ",")
    }
    return "none"
}
var seen = Set<String>()
func dump(_ stream: CGPDFStreamRef, _ path: String) {
    var fmt = CGPDFDataFormat.raw
    if let data = CGPDFStreamCopyData(stream, &fmt) {
        let ext = fmt == .jpegEncoded ? "jpg" : (fmt == .JPEG2000 ? "jp2" : "raw")
        try! (data as Data).write(to: URL(fileURLWithPath: path + "." + ext))
    }
}
func walk(_ res: CGPDFDictionaryRef, _ prefix: String, _ depth: Int) {
    var xo: CGPDFDictionaryRef? = nil
    guard CGPDFDictionaryGetDictionary(res, "XObject", &xo), let xo = xo else { return }
    CGPDFDictionaryApplyBlock(xo, { key, obj, _ in
        let k = String(cString: key)
        var stream: CGPDFStreamRef? = nil
        guard CGPDFObjectGetValue(obj, .stream, &stream), let stream = stream, let d = CGPDFStreamGetDictionary(stream) else { return true }
        let sub = name(d, "Subtype") ?? "?"
        let path = prefix + "/" + k
        if sub == "Image" {
            var sm: CGPDFStreamRef? = nil
            let hasSMask = CGPDFDictionaryGetStream(d, "SMask", &sm)
            var smInfo = ""
            if hasSMask, let sm = sm, let smd = CGPDFStreamGetDictionary(sm) {
                smInfo = " SMask \(int(smd, "Width"))x\(int(smd, "Height")) \(filterOf(smd))"
            }
            var cs = name(d, "ColorSpace") ?? "(array)"
            if cs == "(array)" { cs = "array" }
            print(String(repeating: "  ", count: depth) + "\(path) Image \(int(d, "Width"))x\(int(d, "Height")) bpc=\(int(d, "BitsPerComponent")) cs=\(cs) filter=\(filterOf(d))" + smInfo)
            if let out = outDir {
                let base = out + "/p\(pageNo)" + path.replacingOccurrences(of: "/", with: "_")
                dump(stream, base)
                if hasSMask, let sm = sm { dump(sm, base + "_smask") }
            }
        } else if sub == "Form" {
            print(String(repeating: "  ", count: depth) + "\(path) Form")
            var r: CGPDFDictionaryRef? = nil
            if CGPDFDictionaryGetDictionary(d, "Resources", &r), let r = r { walk(r, path, depth + 1) }
        }
        return true
    }, nil)
}
if let res = page.dictionary.flatMap({ d -> CGPDFDictionaryRef? in var r: CGPDFDictionaryRef? = nil; return CGPDFDictionaryGetDictionary(d, "Resources", &r) ? r : nil }) {
    walk(res, "", 0)
}
