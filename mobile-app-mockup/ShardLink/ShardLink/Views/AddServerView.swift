import SwiftUI

struct AddServerView: View {
    @EnvironmentObject var store: ServerStore
    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var host: String = ""
    @State private var portText: String = "19132"
    @State private var motd: String = ""
    @State private var autoStart: Bool = false

    private var canSave: Bool {
        !name.trimmed.isEmpty &&
        !host.trimmed.isEmpty &&
        UInt16(portText) != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Identification") {
                    TextField("Nom", text: $name)
                        .textInputAutocapitalization(.words)
                }

                Section {
                    TextField("play.shardtown.fr", text: $host)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .font(.body.monospaced())
                    TextField("Port", text: $portText)
                        .keyboardType(.numberPad)
                        .font(.body.monospaced())
                } header: {
                    Text("Adresse")
                } footer: {
                    Text("Adresse IPv4, IPv6 ou nom de domaine. Le port Bedrock par défaut est **19132**.")
                }

                Section {
                    TextField("MOTD", text: $motd)
                    Toggle("Lancer au démarrage", isOn: $autoStart)
                } header: {
                    Text("Affichage dans le jeu")
                } footer: {
                    Text("Le MOTD apparaîtra sous le nom du serveur dans l'onglet **Amis** de Minecraft.")
                }
            }
            .navigationTitle("Nouveau serveur")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ajouter") { save() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private func save() {
        guard let port = UInt16(portText) else { return }
        store.add(Server(
            name: name.trimmed,
            host: host.trimmed,
            port: port,
            motd: motd.trimmed.isEmpty ? name.trimmed : motd.trimmed,
            autoStart: autoStart
        ))
        dismiss()
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
