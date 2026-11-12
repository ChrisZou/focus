import SwiftUI

@main
struct FocusApp: App {
    @StateObject private var model = FocusModel()

    var body: some Scene {
        WindowGroup {
            FocusView(model: model)
                .environment(\.locale, Locale(identifier: "zh_Hans_CN"))
        }
    }
}
