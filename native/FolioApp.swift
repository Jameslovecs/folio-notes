import SwiftUI
import WebKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

let folioURL = URL(string: "https://folio-notes-james.jajamjamjamijamiejamie.chatgpt.site")!

@main
struct FolioApp: App {
    var body: some Scene {
        WindowGroup { FolioView().frame(minWidth: 320, minHeight: 480) }
        #if os(macOS)
        .defaultSize(width: 1280, height: 820)
        #endif
    }
}

struct FolioView: View {
    @State private var failure: String?
    @State private var reloadID = UUID()
    var body: some View {
        ZStack {
            FolioWebView(failure: $failure).id(reloadID)
            if let failure {
                VStack(spacing: 20) {
                    Image(systemName: "book.closed").font(.largeTitle).foregroundStyle(.green)
                    Text("Your notebook will be right here.").font(.title2)
                    Text(failure).multilineTextAlignment(.center).frame(maxWidth: 400)
                    Button("Try again") { self.failure = nil; reloadID = UUID() }
                }.padding(30).background(.regularMaterial).cornerRadius(16)
            }
        }
    }
}

#if os(macOS)
struct FolioWebView: NSViewRepresentable {
    @Binding var failure: String?
    func makeCoordinator() -> WebCoordinator { WebCoordinator(failure: $failure) }
    func makeNSView(context: Context) -> WKWebView { context.coordinator.makeWebView() }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
#else
struct FolioWebView: UIViewRepresentable {
    @Binding var failure: String?
    func makeCoordinator() -> WebCoordinator { WebCoordinator(failure: $failure) }
    func makeUIView(context: Context) -> WKWebView { context.coordinator.makeWebView() }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
#endif

@MainActor
final class WebCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    @Binding var failure: String?
    private var destinations: [ObjectIdentifier: URL] = [:]
    init(failure: Binding<String?>) { _failure = failure }
    func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.limitsNavigationsToAppBoundDomains = true
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        #if os(macOS)
        web.setValue(false, forKey: "drawsBackground")
        #endif
        web.load(URLRequest(url: folioURL))
        return web
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled {
            failure = "Connect to the internet to open Folio. Your saved notes remain in this app’s storage. For reliable offline use, install the web app from Safari."
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { decisionHandler(.download); return }
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.host == folioURL.host || url.scheme == "about" { decisionHandler(.allow); return }
        if ["https", "http", "mailto"].contains(url.scheme ?? "") {
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            UIApplication.shared.open(url)
            #endif
        }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["https", "http", "mailto"].contains(url.scheme ?? "") {
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            UIApplication.shared.open(url)
            #endif
        }
        return nil
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        #if os(macOS)
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.begin { result in completionHandler(result == .OK ? panel.url : nil) }
        #else
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent(URL(fileURLWithPath: suggestedFilename).lastPathComponent)
        destinations[ObjectIdentifier(download)] = destination
        completionHandler(destination)
        #endif
    }
    func downloadDidFinish(_ download: WKDownload) {
        #if !os(macOS)
        guard let url = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        guard let controller = scene?.windows.first(where: \.isKeyWindow)?.rootViewController else { return }
        sheet.popoverPresentationController?.sourceView = controller.view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
        controller.present(sheet, animated: true)
        #endif
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        failure = "Download did not finish. Please retry the export."
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        #if os(macOS)
        let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "Continue"); alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
        #else
        let alert = UIAlertController(title: "Folio", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        if let controller = scene?.windows.first(where: \.isKeyWindow)?.rootViewController { controller.present(alert, animated: true) } else { completionHandler(false) }
        #endif
    }
    #if os(macOS)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories; panel.canChooseFiles = true
        panel.begin { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
    #endif
}
