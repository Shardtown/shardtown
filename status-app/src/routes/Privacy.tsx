import { LegalPage, LegalSection } from "@/components/layout/LegalPage";

export function Privacy() {
  return (
    <LegalPage label="Légal" title="Politique de Confidentialité">
      <LegalSection title="1. Collecte des Données">
        <p>Dans le cadre de l'utilisation des produits et services Shardtown, nous collectons :</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Données Discord (OAuth2) :</strong> votre identifiant Discord, nom d'utilisateur, avatar, et la liste de vos serveurs avec vos permissions sur ceux-ci. Ces données sont obtenues via les scopes <code>identify</code> et <code>guilds</code> avec votre consentement explicite.</li>
          <li><strong>Données de Configuration :</strong> les réglages des bots, messages personnalisés, listes de rôles, codes d'accès, sondages, giveaways et autres paramètres que vous définissez sur nos interfaces.</li>
          <li><strong>Données de Modération :</strong> avertissements, sanctions, journaux d'événements de votre serveur (jointures, départs, vérifications) liés à un identifiant Discord.</li>
          <li><strong>Données de Paiement :</strong> traitées intégralement par Stripe (voir section 4). Nous ne stockons jamais de numéro de carte ni de CVV. Nous conservons uniquement l'identifiant Stripe de la session/abonnement et le statut Premium associé au serveur.</li>
          <li><strong>Données Techniques :</strong> adresses IP (sécurité et limitation de débit), cookies de session, logs d'erreurs.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Finalité du Traitement">
        <p>Vos données sont traitées exclusivement pour :</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Fournir les services demandés (authentification Discord, configuration des bots, modération, vérification, économie, niveaux, tickets, etc.).</li>
          <li>Traiter les paiements Premium et facturer les abonnements via Stripe.</li>
          <li>Assurer la sécurité de l'infrastructure et prévenir les comportements malveillants (anti-raid, listes noires, rate-limiting).</li>
          <li>Gérer les relations commerciales et le support technique.</li>
          <li>Améliorer nos produits via des analyses d'utilisation anonymisées.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Cookies et Stockage Local">
        <p>Nous utilisons exclusivement des cookies <strong>strictement nécessaires</strong> au fonctionnement du site :</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><code>sgid</code> : cookie de session HTTP-only, SameSite=Lax, Secure en production. Durée : 24h. Permet de maintenir votre connexion Discord OAuth.</li>
          <li>Jeton CSRF de session : protège contre les soumissions de formulaire frauduleuses.</li>
        </ul>
        <p className="mt-3">Aucun cookie de tracking publicitaire, analytics tiers, ou de profilage n'est déposé.</p>
      </LegalSection>

      <LegalSection title="4. Sous-traitants et Partage des Données">
        <p>Vos données peuvent être transférées à nos sous-traitants techniques, strictement nécessaires à la fourniture du service :</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Discord Inc.</strong> (États-Unis) — authentification OAuth2, exécution des bots Discord. Voir la <a href="https://discord.com/privacy" target="_blank" rel="noopener" className="underline">politique de confidentialité de Discord</a>.</li>
          <li><strong>Stripe Payments Europe</strong> (Irlande) — traitement des paiements. Stripe est certifié PCI-DSS. Voir la <a href="https://stripe.com/fr/privacy" target="_blank" rel="noopener" className="underline">politique Stripe</a>.</li>
          <li><strong>Hébergeur</strong> — stockage des données applicatives sur serveur dédié situé en Europe (Allemagne).</li>
        </ul>
        <p className="mt-3">Shardtown ne vend, ne loue et ne partage jamais vos données à des fins publicitaires ou commerciales tierces.</p>
      </LegalSection>

      <LegalSection title="5. Conservation des Données">
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Données de compte / OAuth :</strong> conservées tant que vous utilisez le service. Supprimées dans les 30 jours suivant votre demande.</li>
          <li><strong>Données de configuration / modération :</strong> conservées tant que le bot est présent sur le serveur. Supprimées dans les 30 jours après son retrait.</li>
          <li><strong>Logs techniques et IP :</strong> 30 jours maximum.</li>
          <li><strong>Données de paiement (Stripe IDs, factures) :</strong> 10 ans, conformément aux obligations comptables et fiscales françaises.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Sécurité">
        <p>
          Nous mettons en œuvre des mesures techniques et organisationnelles : connexions chiffrées TLS,
          mots de passe administrateurs hachés (scrypt), jetons CSRF, limitation de débit, en-têtes de
          sécurité (CSP, X-Frame-Options, HSTS), accès base de données restreints. En cas de violation de
          données concernant des données personnelles, nous notifierons les utilisateurs concernés et la CNIL
          conformément à l'article 33 du RGPD.
        </p>
      </LegalSection>

      <LegalSection title="7. Vos Droits (RGPD)">
        <p>Conformément aux articles 15 à 22 du Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Droit d'accès, de rectification et d'effacement (« droit à l'oubli »).</li>
          <li>Droit à la limitation et à l'opposition au traitement.</li>
          <li>Droit à la portabilité de vos données.</li>
          <li>Droit de retirer votre consentement à tout moment (révocation OAuth Discord).</li>
          <li>Droit d'introduire une réclamation auprès de la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener" className="underline">CNIL</a>.</li>
        </ul>
        <p className="mt-3">Pour exercer ces droits : contactez-nous via Discord ou par email à l'adresse de contact indiquée en page d'accueil.</p>
      </LegalSection>

      <LegalSection title="8. Évolution de la Politique">
        <p>
          Cette politique peut être mise à jour pour refléter les évolutions de nos services ou de la
          législation. Dernière mise à jour : avril 2026. Nous vous invitons à la consulter régulièrement.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
