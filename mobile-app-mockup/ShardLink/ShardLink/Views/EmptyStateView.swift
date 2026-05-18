import SwiftUI

struct EmptyStateView: View {
    let onAdd: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.tertiarySystemFill))
                .frame(width: 76, height: 76)
                .overlay(
                    Image(systemName: "server.rack")
                        .font(.system(size: 32, weight: .regular))
                        .foregroundStyle(.secondary)
                )
            Text("Aucun serveur")
                .font(.title2.bold())
            Text("Ajoute un serveur Bedrock distant pour le faire apparaître comme partie LAN sur ta console.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 260)
            Button(action: onAdd) {
                Label("Ajouter un serveur", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
            .padding(.top, 8)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}
