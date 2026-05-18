import SwiftUI

struct ServerListView: View {
    @EnvironmentObject var store: ServerStore
    @EnvironmentObject var broadcaster: LANBroadcaster
    let onSelect: (Server) -> Void

    var body: some View {
        List {
            if let active = broadcaster.currentServer, broadcaster.isRunning {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 6, height: 6)
                            Text("DIFFUSION EN COURS")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(Color.green)
                        }
                        Text(active.name)
                            .font(.title3.bold())
                        Text("\(active.host) · \(String(active.port))")
                            .font(.subheadline.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                    .onTapGesture { onSelect(active) }
                }
            }

            Section("Mes serveurs") {
                ForEach(store.servers) { server in
                    Button(action: { tap(server) }) {
                        ServerRow(
                            server: server,
                            isLive: broadcaster.currentServer?.id == server.id && broadcaster.isRunning
                        )
                    }
                    .buttonStyle(.plain)
                }
                .onDelete { offsets in
                    let removed = offsets.map { store.servers[$0] }
                    if removed.contains(where: { $0.id == broadcaster.currentServer?.id }) {
                        broadcaster.stop()
                    }
                    store.remove(at: offsets)
                }
            } footer: {
                Text("Touche un serveur pour le diffuser sur ton Wi-Fi. Il apparaîtra dans l'onglet **Amis** de Minecraft Bedrock.")
            }
        }
        .listStyle(.insetGrouped)
    }

    private func tap(_ server: Server) {
        if broadcaster.currentServer?.id == server.id, broadcaster.isRunning {
            onSelect(server)
        } else {
            broadcaster.start(server: server)
            onSelect(server)
        }
    }
}

private struct ServerRow: View {
    let server: Server
    let isLive: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(isLive ? Color.green : Color(.tertiaryLabel))
                    .frame(width: 10, height: 10)
                if isLive {
                    Circle()
                        .stroke(Color.green.opacity(0.25), lineWidth: 4)
                        .frame(width: 18, height: 18)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(server.name)
                    .font(.body)
                Text("\(server.host):\(String(server.port))")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color(.tertiaryLabel))
        }
        .padding(.vertical, 6)
    }
}
