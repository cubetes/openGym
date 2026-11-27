import Foundation
import CryptoKit

/// Natural voice: the pure rules (cache key, decimals, cache trimming, fall-back, chunk joins).
public enum NaturalVoiceMath {
    /// Same text, voice, rounded speed and model revision give the same file name.
    public static func cacheKey(text: String, voice: String, speed: Double, revision: String) -> String {
        let raw = [text, voice, String(format: "%.2f", speed), revision].joined(separator: "\u{1F}")
        return SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// "92.5" is read "92 point 5" so the voice does not say "ninety-two five".
    public static func speakable(_ text: String) -> String {
        text.replacingOccurrences(of: #"(\d+)\.(\d+)"#, with: "$1 point $2", options: .regularExpression)
    }

    /// The model's reported length when it is in 1...capacity, else the whole window (never cut speech on a bad value).
    public static func usableLength(reported: Int, capacity: Int) -> Int { (1...max(capacity, 1)).contains(reported) ? reported : capacity }

    /// Silence between two joined chunks.
    public static let gapMs = 80
    public static func gapSamples(rate: Int) -> Int { rate * gapMs / 1000 }

    /// Names to delete so only `keep` files remain, oldest first.
    public static func prune(_ files: [(name: String, modified: Double)], keep: Int) -> [String] {
        files.sorted { $0.modified < $1.modified }.prefix(max(files.count - keep, 0)).map { $0.name }
    }

    /// Longest wait for the natural voice before the system voice speaks instead.
    public static let fallBackSec = 2.0
    public static func shouldFallBack(waited: Double, hasAudio: Bool, failed: Bool) -> Bool {
        !hasAudio && (failed || waited >= fallBackSec)
    }

    /// A copied folder is usable only when every expected file is there at its full size.
    public static func isCompleteCopy(expected: [String: Int], found: [String: Int]) -> Bool {
        expected.allSatisfy { found[$0.key] == $0.value }
    }
}
