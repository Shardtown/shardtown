import SwiftUI

struct PartnersView: View {
    @EnvironmentObject var store: ServerStore
    @EnvironmentObject var broadcaster: LANBroadcaster

    @State private var selectedPartner: PartnerServer?

    private var verified: [PartnerServer] { PartnerCatalog.all.filter(\.verified) }
    private var community: [PartnerServer] { PartnerCatalog.all.filter { !$0.verified } }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.title3)
                            .foregroundStyle(.tint)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Serveurs partenaires")
                                .font(.headline)
                            Text("Sélection vérifiée de serveurs Bedrock français — tape pour diffuser ou ajouter à ta liste.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineSpacing(2)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowBackground(Color.clear)

                Section("Vérifiés Shardtown") {
                    ForEach(verified) { p in
                        Button {
                            selectedPartner = p
                        } label: {
                            PartnerRow(partner: p, isLive: isLive(p))
                        }
                        .foregroundStyle(.primary)
                    }
                }

                if !community.isEmpty {
                    Section {
                        ForEach(community) { p in
                            Button {
                                selectedPartner = p
                            } label: {
                                PartnerRow(partner: p, isLive: isLive(p))
                            }
                            .foregroundStyle(.primary)
                        }
                    } header: {
                        Text("Communauté")
                    } footer: {
                        Text("Serveurs proposés par la communauté. Ils ne sont pas affiliés à Shardtown.")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(SiteBackground())
            .navigationTitle("Partenaires")
            .sheet(item: $selectedPartner) { partner in
                PartnerDetailView(partner: partner)
            }
        }
    }

    private func isLive(_ p: PartnerServer) -> Bool {
        guard broadcaster.isRunning, let current = broadcaster.currentServer else { return false }
        return current.host == p.host && current.port == p.port
    }
}

// MARK: - Row

private struct PartnerRow: View {
    let partner: PartnerServer
    let isLive: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(partner.accent.gradient)
                    .frame(width: 40, height: 40)
                Image(systemName: partner.icon)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(partner.name)
                        .font(.body)
                    if partner.verified {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tint)
                    }
                }
                Text("\(partner.host):\(String(partner.port))")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if isLive {
                liveBadge
            } else {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }

    private var liveBadge: some View {
        HStack(spacing: 4) {
            Circle().fill(.green).frame(width: 5, height: 5)
            Text("LIVE")
                .font(.caption2.weight(.bold))
                .kerning(0.6)
        }
        .foregroundStyle(.green)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Color.green.opacity(0.12))
        .clipShape(Capsule())
    }
}

// MARK: - Detail sheet

struct PartnerDetailView: View {
    @EnvironmentObject var store: ServerStore
    @EnvironmentObject var broadcaster: LANBroadcaster
    @Environment(\.dismiss) private var dismiss
    let partner: PartnerServer

    private var isLive: Bool {
        guard broadcaster.isRunning, let c = broadcaster.currentServer else { return false }
        return c.host == partner.host && c.port == partner.port
    }

    private var isInList: Bool {
        store.servers.contains { $0.host == partner.host && $0.port == partner.port }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(partner.accent.gradient)
                                .frame(width: 88, height: 88)
                            Image(systemName: partner.icon)
                                .font(.system(size: 38, weight: .medium))
                                .foregroundStyle(.white)
                        }
                        .shadow(color: partner.accent.opacity(0.4), radius: 16, x: 0, y: 8)

                        VStack(spacing: 4) {
                            HStack(spacing: 5) {
                                Text(partner.name)
                                    .font(.title3.bold())
                                if partner.verified {
                                    Image(systemName: "checkmark.seal.fill")
                                        .foregroundStyle(.tint)
                                }
                            }
                            Text("\(partner.host):\(String(partner.port))")
                                .font(.subheadline.monospaced())
                                .foregroundStyle(.secondary)
                        }

                        HStack(spacing: 6) {
                            ForEach(partner.tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 9)
                                    .padding(.vertical, 4)
                                    .background(Color(.tertiarySystemFill))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
                .listRowBackground(Color.clear)

                Section("À propos") {
                    Text(partner.description)
                        .foregroundStyle(.primary)
                        .lineSpacing(2)
                }

                Section { Color.clear.frame(height: 76) }
                    .listRowBackground(Color.clear)
                    .listSectionSeparator(.hidden)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .navigationTitle("Serveur partenaire")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.semibold))
                            .frame(width: 30, height: 30)
                    }
                    .glassEffect(.regular.interactive(), in: Circle())
                }
            }
            .safeAreaInset(edge: .bottom) {
                actionBar
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            }
        }
    }

    private var actionBar: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                if !isInList {
                    Button(action: addToList) {
                        Label("Ajouter", systemImage: "plus")
                            .font(.body.weight(.semibold))
                            .padding(.horizontal, 18)
                            .padding(.vertical, 14)
                    }
                    .glassEffect(.regular.interactive(), in: Capsule())
                }

                Button(action: toggleBroadcast) {
                    Label(
                        isLive ? "Arrêter" : "Diffuser",
                        systemImage: isLive ? "stop.fill" : "play.fill"
                    )
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .padding(.horizontal, 24)
                }
                .glassEffect(
                    .regular.tint(isLive ? .red : partner.accent).interactive(),
                    in: Capsule()
                )
            }
        }
    }

    private func addToList() {
        store.add(partner.asServer())
    }

    private func toggleBroadcast() {
        if isLive {
            broadcaster.stop()
        } else {
            if !isInList { store.add(partner.asServer()) }
            broadcaster.start(server: partner.asServer())
        }
        dismiss()
    }
}

#Preview {
    PartnersView()
        .environmentObject(ServerStore())
        .environmentObject(LANBroadcaster())
}
