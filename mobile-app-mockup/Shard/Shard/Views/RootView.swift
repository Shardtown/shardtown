import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            HowToUseView()
                .tabItem {
                    Label("Comment utiliser", systemImage: "play.circle")
                }

            TroubleshootingView()
                .tabItem {
                    Label("Dépannage", systemImage: "wrench.and.screwdriver")
                }

            AboutView()
                .tabItem {
                    Label("À propos", systemImage: "info.circle")
                }
        }
        .tint(.indigo)
    }
}

#Preview {
    RootView()
}
