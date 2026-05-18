import SwiftUI

@main
struct ShardLinkApp: App {
    @StateObject private var store = ServerStore()
    @StateObject private var broadcaster = LANBroadcaster()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(broadcaster)
        }
    }
}
