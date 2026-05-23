import SwiftUI

@main
struct ShardApp: App {
    @StateObject private var auth = AuthSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
        }
    }
}
