import Foundation
import Capacitor
import System
#if canImport(BackgroundAssets)
import BackgroundAssets
#endif

/**
 * The Natural voice model, from an Apple-hosted asset pack (`voice-natural-en`, built by
 * scripts/voice/make-voice-pack.mjs). Core ML needs a real `.mlmodelc` folder and a pack's files
 * are only readable through AssetPackManager (see AnimationPacksPlugin), so download copies every
 * file out once to NaturalVoiceEngine.copiedDir, writes `complete.json` last, then removes the pack.
 * The pack lists its own files in `voice-natural-en/files.json` ({ "<path>": <bytes> }).
 * Page side: frontend/src/lib/natural-voice.js.
 */
@objc(NaturalVoicePlugin)
public class NaturalVoicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NaturalVoicePlugin"
    public let jsName = "NaturalVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private static let packId = "voice-natural-en"
    /// Ruling 4: what the pack must hold at its top level; every name needs at least one file in files.json.
    private static let required = [
        "kokoro_5s.mlmodelc", "G2PEncoder.mlmodelc", "G2PDecoder.mlmodelc",
        "us_gold.json", "us_silver.json", "gb_gold.json", "gb_silver.json",
        "vocab_index.json", "g2p_vocab.json", "config.json",
        "voices/af_heart.json", "voices/am_michael.json", "voices/bf_emma.json",
    ]
    private static let downloadShare = 0.95

    private let lock = NSLock()
    private var job: Task<Void, Never>?
    private var running: Bool { lock.lock(); defer { lock.unlock() }; return job != nil }

    private static func modelDir() -> URL? {
        if #available(iOS 16.0, *) { return NaturalVoiceEngine.modelDir() }
        return nil
    }

    private static var copiedDir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NaturalVoice/d21aa979", isDirectory: true)
    }

    /// The DEBUG model folder (Ruling 6): in use, but not ours to delete.
    private static var debugModel: Bool {
        #if DEBUG
        if let dir = modelDir() { return dir.standardizedFileURL.path != copiedDir.standardizedFileURL.path }
        #endif
        return false
    }

    private static var canDownload: Bool {
        if #available(iOS 26.0, *) { return AnimationPacksPlugin.supported }
        return false
    }

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": NaturalVoicePlugin.canDownload, "debugModel": NaturalVoicePlugin.debugModel])
    }

    @objc func status(_ call: CAPPluginCall) {
        if let dir = NaturalVoicePlugin.modelDir() {
            call.resolve(["state": "ready", "bytes": AnimationPacksPlugin.walk(dir).1])
        } else if running {
            call.resolve(["state": "downloading"])
        } else {
            // A killed or failed copy has no passing complete.json: clear it away.
            try? FileManager.default.removeItem(at: NaturalVoicePlugin.copiedDir)
            call.resolve(["state": "none"])
        }
    }

    /// Apple's figure for the download, in bytes.
    @objc func info(_ call: CAPPluginCall) {
        #if canImport(BackgroundAssets)
        if NaturalVoicePlugin.canDownload, #available(iOS 26.0, *) {
            Task {
                if let pack = try? await AssetPackManager.shared.assetPack(withID: NaturalVoicePlugin.packId) {
                    call.resolve(["downloadSize": pack.downloadSize])
                } else {
                    call.resolve([:])
                }
            }
            return
        }
        #endif
        call.resolve([:])
    }

    @objc func download(_ call: CAPPluginCall) {
        guard NaturalVoicePlugin.canDownload else { call.reject("asset packs need iOS 26", "unavailable"); return }
        let wifiOnly = call.getBool("wifiOnly") ?? true
        #if canImport(BackgroundAssets)
        if #available(iOS 26.0, *) {
            lock.lock()
            if job != nil { lock.unlock(); call.reject("already running", "failed"); return }
            job = Task { [weak self] in
                if wifiOnly, await !AnimationPacksPlugin.onWifi() {
                    call.reject("waiting for Wi-Fi", "needs-wifi")
                } else {
                    do {
                        try await self?.fetch(call)
                        call.resolve()
                    } catch {
                        try? FileManager.default.removeItem(at: NaturalVoicePlugin.copiedDir)
                        if error is CancellationError || Task.isCancelled {
                            call.reject("cancelled", "cancelled")
                        } else {
                            call.reject(error.localizedDescription, "failed")
                        }
                    }
                }
                self?.lock.lock(); self?.job = nil; self?.lock.unlock()
            }
            lock.unlock()
            return
        }
        #endif
        call.reject("asset packs need iOS 26", "unavailable")
    }

    @objc func cancel(_ call: CAPPluginCall) {
        lock.lock(); job?.cancel(); lock.unlock()
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        Task {
            try? FileManager.default.removeItem(at: NaturalVoicePlugin.copiedDir)
            if #available(iOS 16.0, *) {
                try? FileManager.default.removeItem(at: NaturalVoiceEngine.cacheDir)
                await NaturalVoiceEngine.shared.unload()
            }
            #if canImport(BackgroundAssets)
            if NaturalVoicePlugin.canDownload, #available(iOS 26.0, *) {
                try? await AssetPackManager.shared.remove(assetPackWithID: NaturalVoicePlugin.packId)
            }
            #endif
            call.resolve()
        }
    }

    #if canImport(BackgroundAssets)
    /// Download the pack, copy its files out, write complete.json last, drop the pack.
    @available(iOS 26.0, *)
    private func fetch(_ call: CAPPluginCall) async throws {
        let id = NaturalVoicePlugin.packId
        let manager = AssetPackManager.shared
        let watcher = Task { [weak self] in
            for await update in await manager.statusUpdates(forAssetPackWithID: id) {
                if case .downloading(_, let progress) = update {
                    self?.notifyListeners("progress", data: ["fraction": progress.fractionCompleted * NaturalVoicePlugin.downloadShare])
                }
            }
        }
        defer { watcher.cancel() }
        try await manager.ensureLocalAvailability(of: try await manager.assetPack(withID: id))
        watcher.cancel()

        let listing = try manager.contents(at: FilePath("\(id)/files.json"), searchingInAssetPackWithID: id)
        let files = try JSONDecoder().decode([String: Int].self, from: listing)
        let paths = files.keys
        guard paths.allSatisfy({ !$0.hasPrefix("/") && !$0.split(separator: "/").contains("..") }),
              NaturalVoicePlugin.required.allSatisfy({ name in paths.contains { $0 == name || $0.hasPrefix(name + "/") } })
        else { throw CocoaError(.fileReadCorruptFile) }

        let dest = NaturalVoicePlugin.copiedDir
        let fm = FileManager.default
        try? fm.removeItem(at: dest)
        try fm.createDirectory(at: dest, withIntermediateDirectories: true)
        var flag = URLResourceValues()
        flag.isExcludedFromBackup = true
        var excluded = dest
        try excluded.setResourceValues(flag)

        let total = max(files.values.reduce(0, +), 1)
        var copied = 0
        var lastSent = 0.0
        var buffer = [UInt8](repeating: 0, count: 1 << 20)
        for path in paths.sorted() {
            try Task.checkCancellation()
            let target = dest.appendingPathComponent(path)
            try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            fm.createFile(atPath: target.path, contents: nil)
            let out = try FileHandle(forWritingTo: target)
            let source = try manager.descriptor(for: FilePath("\(id)/\(path)"), searchingInAssetPackWithID: id)
            defer { try? out.close(); try? source.close() }
            while true {
                try Task.checkCancellation()
                let n = try buffer.withUnsafeMutableBytes { try source.read(into: $0) }
                if n == 0 { break }
                try out.write(contentsOf: buffer[0..<n])
                copied += n
                let fraction = NaturalVoicePlugin.downloadShare + (1 - NaturalVoicePlugin.downloadShare) * Double(copied) / Double(total)
                if fraction - lastSent >= 0.005 {
                    lastSent = fraction
                    notifyListeners("progress", data: ["fraction": fraction])
                }
            }
        }

        guard NaturalVoiceMath.isCompleteCopy(expected: files, found: NaturalVoiceEngine.sizesOnDisk(of: Array(paths), in: dest)) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        try JSONEncoder().encode(["files": files]).write(to: dest.appendingPathComponent("complete.json"), options: .atomic)
        try? await manager.remove(assetPackWithID: id)
        notifyListeners("progress", data: ["fraction": 1.0])
    }
    #endif
}
