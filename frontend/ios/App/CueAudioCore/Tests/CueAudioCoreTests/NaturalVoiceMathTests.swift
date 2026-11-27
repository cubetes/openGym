import XCTest
@testable import CueAudioCore

final class NaturalVoiceMathTests: XCTestCase {
    func testCacheKey() {
        let a = NaturalVoiceMath.cacheKey(text: "Set 3", voice: "af", speed: 1.0, revision: "r1")
        XCTAssertEqual(a, NaturalVoiceMath.cacheKey(text: "Set 3", voice: "af", speed: 1.0, revision: "r1"))
        XCTAssertEqual(a, NaturalVoiceMath.cacheKey(text: "Set 3", voice: "af", speed: 1.004, revision: "r1"))
        XCTAssertNotEqual(a, NaturalVoiceMath.cacheKey(text: "Set 3", voice: "bf", speed: 1.0, revision: "r1"))
        XCTAssertNotEqual(a, NaturalVoiceMath.cacheKey(text: "Set 3", voice: "af", speed: 1.0, revision: "r2"))
        XCTAssertEqual(a.count, 64)
    }

    func testSpeakable() {
        XCTAssertEqual(NaturalVoiceMath.speakable("92.5 kilos for 8"), "92 point 5 kilos for 8")
        XCTAssertEqual(NaturalVoiceMath.speakable("Set 3"), "Set 3")
    }

    func testUsableLengthAndGap() {
        XCTAssertEqual(NaturalVoiceMath.usableLength(reported: 0, capacity: 120), 120)
        XCTAssertEqual(NaturalVoiceMath.usableLength(reported: 50, capacity: 120), 50)
        XCTAssertEqual(NaturalVoiceMath.usableLength(reported: 121, capacity: 120), 120)
        XCTAssertEqual(NaturalVoiceMath.gapSamples(rate: 24000), 1920)
    }

    func testPrune() {
        let files = (0..<302).map { (name: "f\($0)", modified: Double(301 - $0)) }
        XCTAssertEqual(NaturalVoiceMath.prune(files, keep: 300), ["f301", "f300"])
        XCTAssertEqual(NaturalVoiceMath.prune(files, keep: 400), [])
    }

    func testShouldFallBack() {
        XCTAssertTrue(NaturalVoiceMath.shouldFallBack(waited: 2.1, hasAudio: false, failed: false))
        XCTAssertFalse(NaturalVoiceMath.shouldFallBack(waited: 1.0, hasAudio: false, failed: false))
        XCTAssertTrue(NaturalVoiceMath.shouldFallBack(waited: 0.1, hasAudio: false, failed: true))
        XCTAssertFalse(NaturalVoiceMath.shouldFallBack(waited: 3.0, hasAudio: true, failed: false))
    }

    func testIsCompleteCopy() {
        XCTAssertTrue(NaturalVoiceMath.isCompleteCopy(expected: ["a": 10, "b": 20], found: ["a": 10, "b": 20, "c": 1]))
        XCTAssertFalse(NaturalVoiceMath.isCompleteCopy(expected: ["a": 10, "b": 20], found: ["a": 10, "b": 19]))
        XCTAssertFalse(NaturalVoiceMath.isCompleteCopy(expected: ["a": 10], found: [:]))
    }
}
