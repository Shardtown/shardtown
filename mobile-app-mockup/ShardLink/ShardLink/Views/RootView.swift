import SwiftUI

struct RootView: View {
    @EnvironmentObject var store: ServerStore
    @EnvironmentObject var broadcaster: LANBroadcaster
    @State private var showingAdd = false
    @State private var selectedServer: Server?

    var body: some View {
        NavigationStack {
            Group {
                if store.servers.isEmpty {
                    EmptyStateView(onAdd: { showingAdd = true })
                } else {
                    ServerListView(onSelect: { selectedServer = $0 })
                }
            }
            .navigationTitle("Serveurs")
            .toolbar {
                if !store.servers.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
                        EditButton()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { showingAdd = true }) {
                        Image(systemName: "plus")
                            .font(.body.weight(.semibold))
                    }
                }
            }
            .sheet(isPresented: $showingAdd) {
                AddServerView()
            }
            .sheet(item: $selectedServer) { server in
                ServerDetailView(server: server)
            }
        }
    }
}

#Preview {
    RootView()
        .environmentObject(ServerStore())
        .environmentObject(LANBroadcaster())
}
