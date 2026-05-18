import SwiftUI

struct ServerDetailView: View {
    @EnvironmentObject var broadcaster: LANBroadcaster
    @Environment(\.dismiss) private var dismiss
    let server: Server

    @State private var now = Date()
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var isLive: Bool {
        broadcaster.currentServer?.id == server.id && broadcaster.isRunning
    }

    private var elapsedString: String {
        guard let start = broadcaster.startedAt, isLive else { return "--:--" }
        let s = Int(now.timeIntervalSince(start))
        return String(format: "%02d:%02d", s / 60, s % 60)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    LiveBanner(server: server, isLive: isLive)

                    HStack(spacing: 8) {
                        Metric(value: "\(broadcaster.pingCount)", label: "Pings")
                        Metric(value: isLive ? "1/20" : "0/20", label: "Joueurs")
                        Metric(value: elapsedString, label: "Diffusion")
                    }

                    InstructionsCard()

                    if let err = broadcaster.lastError {
                        Text(err)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.secondarySystemGroupedBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    if isLive {
                        Button(role: .destructive) {
                            broadcaster.stop()
                        } label: {
                            Label("Arrêter la diffusion", systemImage: "stop.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.red)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    } else {
                        Button {
                            broadcaster.start(server: server)
                        } label: {
                            Label("Démarrer la diffusion", systemImage: "play.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.accentColor)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(server.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("OK") { dismiss() }
                }
            }
            .onReceive(timer) { now = $0 }
        }
    }
}

private struct LiveBanner: View {
    let server: Server
    let isLive: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle()
                    .fill(.white)
                    .frame(width: 7, height: 7)
                    .opacity(isLive ? 1 : 0.4)
                Text(isLive ? "DIFFUSION ACTIVE" : "EN ATTENTE")
                    .font(.caption2.weight(.bold))
                    .kerning(1)
            }
            .foregroundStyle(.white.opacity(0.9))
            Text(server.name)
                .font(.title2.bold())
                .foregroundStyle(.white)
            Text("\(server.host) · \(String(server.port))")
                .font(.subheadline.monospaced())
                .foregroundStyle(.white.opacity(0.9))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: isLive
                    ? [Color(red: 0.20, green: 0.78, blue: 0.35), Color(red: 0.18, green: 0.72, blue: 0.34)]
                    : [Color.gray.opacity(0.7), Color.gray.opacity(0.5)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: (isLive ? Color.green : Color.gray).opacity(0.35), radius: 14, x: 0, y: 8)
    }
}

private struct Metric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline)
            Text(label.uppercased())
                .font(.caption2)
                .foregroundStyle(.secondary)
                .kerning(0.4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct InstructionsCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("CÔTÉ CONSOLE")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .kerning(0.4)
            step(1, "Ouvre Minecraft sur le même Wi-Fi que cet iPhone.")
            step(2, "Onglet **Jouer** → **Amis**.")
            step(3, "Le serveur apparaît dans **Parties LAN**.")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(n)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 20, height: 20)
                .background(Color.accentColor)
                .clipShape(Circle())
            Text(try! AttributedString(markdown: text))
                .font(.subheadline)
        }
    }
}
