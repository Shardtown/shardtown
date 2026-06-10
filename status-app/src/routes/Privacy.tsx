import { Link } from "react-router-dom";
import { LegalPage, LegalSection } from "@/components/layout/LegalPage";

const TOC = [
  { id: "responsable", label: "1. Responsable de traitement" },
  { id: "donnees", label: "2. Données collectées" },
  { id: "finalites", label: "3. Finalités & bases légales" },
  { id: "destinataires", label: "4. Destinataires & sous-traitants" },
  { id: "transferts", label: "5. Transferts hors UE" },
  { id: "duree", label: "6. Durées de conservation" },
  { id: "securite", label: "7. Sécurité" },
  { id: "cookies", label: "8. Cookies & stockage local" },
  { id: "mineurs", label: "9. Mineurs" },
  { id: "ia", label: "10. Assistante IA Shard" },
  { id: "droits", label: "11. Vos droits (RGPD)" },
  { id: "violation", label: "12. Violation de données" },
  { id: "evolution", label: "13. Évolution de la politique" },
  { id: "contact", label: "14. Contact & réclamation" },
];

export function Privacy() {
  return (
    <LegalPage
      overline="Légal · Vie privée"
      title="VIE PRIVÉE"
      subtitle="Politique de confidentialité, comment Shardtown traite vos données personnelles, conformément au RGPD."
      lastUpdated="10 juin 2026"
      toc={TOC}
    >
      <LegalSection id="responsable" title="1. Responsable de traitement">
        <p>
          Le responsable du traitement des données personnelles collectées via
          les services Shardtown (« <strong>les Services</strong> ») est
          <strong> Shardtown</strong>, joignable à l'adresse
          <strong> contact@shardtwn.fr</strong>.
        </p>
        <p>
          En l'absence de désignation d'un Délégué à la Protection des Données
          (DPO), dispositif non obligatoire au regard de notre activité —
          toute demande relative à la protection de vos données peut être
          adressée à la même adresse.
        </p>
      </LegalSection>

      <LegalSection id="donnees" title="2. Données collectées">
        <p>Selon votre usage, les Services collectent les catégories suivantes :</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Identifiants Discord</strong> (via OAuth2, scopes
            <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">identify</code>
            et
            <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">guilds</code>) :
            ID Discord, pseudo, avatar, liste des serveurs où vous disposez
            de permissions d'administration. Pas d'accès à vos messages
            privés ni à vos amis.
          </li>
          <li>
            <strong>Compte Shardtown</strong> (optionnel) : email, pseudo,
            mot de passe haché (scrypt+salt), passkeys WebAuthn,
            sessions actives.
          </li>
          <li>
            <strong>Données de configuration</strong> : réglages des bots,
            règlements, mots interdits, paliers XP, embeds personnalisés,
            sondages, giveaways, configurations de tickets, etc.
          </li>
          <li>
            <strong>Données de modération & journaux</strong> :
            avertissements, mutes, kicks, bans, captchas réussis/échoués,
            événements de jointure et de départ liés à un identifiant Discord
            au sein de votre serveur.
          </li>
          <li>
            <strong>Données de paiement</strong> : traitées
            <strong> intégralement par Stripe</strong>. Shardtown ne stocke
            ni numéro de carte, ni CVV. Nous conservons uniquement les
            identifiants Stripe (customer, subscription, charge), le statut
            Premium et la facture associée.
          </li>
          <li>
            <strong>Données techniques</strong> : adresse IP (sécurité,
            anti-abus, rate-limiting), user-agent, cookies de session,
            journaux d'erreurs et de requêtes.
          </li>
          <li>
            <strong>Conversations avec Shard</strong> (notre assistante IA) :
            les messages échangés sont conservés <strong>uniquement en
            mémoire process</strong> pendant une heure d'inactivité, puis
            effacés automatiquement. Aucun stockage en base de données.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="finalites" title="3. Finalités & bases légales">
        <p>
          Conformément à l'article 6 du RGPD, chaque traitement repose sur
          l'une des bases légales suivantes :
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Exécution du contrat</strong> (art. 6.1.b) : authentification,
            configuration et exécution des bots, traitement des paiements
            Premium, support technique.
          </li>
          <li>
            <strong>Intérêt légitime</strong> (art. 6.1.f) : sécurité de
            l'infrastructure (anti-raid, anti-spam, listes noires partagées,
            détection de fraude), amélioration des Services, prévention
            d'abus.
          </li>
          <li>
            <strong>Consentement</strong> (art. 6.1.a) : connexion via
            Discord OAuth2, opt-in à des fonctionnalités optionnelles,
            sauvegarde de l'historique de conversation avec Shard.
          </li>
          <li>
            <strong>Obligation légale</strong> (art. 6.1.c) : conservation
            des factures et des données fiscales pendant 10 ans
            (article L.123-22 du Code de commerce).
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="destinataires" title="4. Destinataires & sous-traitants">
        <p>
          Vos données sont traitées par notre équipe et par des
          sous-traitants techniques strictement nécessaires à la fourniture
          des Services. Aucune donnée n'est vendue, louée ni partagée à des
          fins publicitaires ou commerciales.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Discord Inc.</strong> (États-Unis), exécution des bots
            Discord, authentification OAuth2.
            <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer" className="underline ml-1">Politique Discord</a>.
          </li>
          <li>
            <strong>Stripe Payments Europe Ltd</strong> (Irlande), traitement
            des paiements (PCI-DSS Level 1).
            <a href="https://stripe.com/fr/privacy" target="_blank" rel="noopener noreferrer" className="underline ml-1">Politique Stripe</a>.
          </li>
          <li>
            <strong>Winheberg</strong> (France), hébergeur VPS. Stockage de
            la base de données, exécution du backend Node.js, hébergement du
            modèle d'IA Shard (auto-hébergé via Ollama, aucune requête
            sortante vers une IA tierce).{" "}
            <a href="https://www.winheberg.fr" target="_blank" rel="noopener noreferrer" className="underline">winheberg.fr</a>.
          </li>
          <li>
            <strong>Service email transactionnel</strong>, pour l'envoi des
            codes de vérification et notifications, sous SPF/DKIM/DMARC.
          </li>
        </ul>
        <p>
          Chaque sous-traitant est lié par un contrat de sous-traitance
          (art. 28 RGPD) imposant des obligations de sécurité et de
          confidentialité équivalentes aux nôtres.
        </p>
      </LegalSection>

      <LegalSection id="transferts" title="5. Transferts hors Union Européenne">
        <p>
          Le seul transfert hors UE concerne <strong>Discord Inc.</strong>
          (États-Unis), nécessaire à l'exécution des bots sur la plateforme
          Discord. Discord adhère au cadre <strong>EU-U.S. Data Privacy
          Framework</strong>, garantissant un niveau de protection adéquat
          au sens des articles 44 et suivants du RGPD.
        </p>
        <p>
          Toutes les autres données (configuration, paiement, IA Shard,
          email, sauvegardes) restent <strong>hébergées en France (Union
          Européenne)</strong>, chez Winheberg.
        </p>
      </LegalSection>

      <LegalSection id="duree" title="6. Durées de conservation">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Compte (Discord OAuth ou compte Shardtown)</strong> : tant que vous l'utilisez. Suppression automatique après 30 jours d'inactivité prolongée ou sur demande.</li>
          <li><strong>Configuration & modération d'un serveur</strong> : tant que le bot est présent sur le serveur. 30 jours après son retrait, puis suppression automatique.</li>
          <li><strong>Logs techniques & adresses IP</strong> : 30 jours maximum.</li>
          <li><strong>Conversations avec Shard</strong> : 1 heure en mémoire process puis effacement automatique. Aucune persistance.</li>
          <li><strong>Données de paiement (factures, IDs Stripe)</strong> : 10 ans, conformément aux obligations comptables et fiscales (art. L.123-22 Code de commerce).</li>
          <li><strong>Tokens d'authentification, cookies de session</strong> : 24 heures.</li>
          <li><strong>Codes de vérification email</strong> : 15 minutes.</li>
        </ul>
      </LegalSection>

      <LegalSection id="securite" title="7. Sécurité">
        <p>
          Nous mettons en œuvre les mesures techniques et organisationnelles
          appropriées au sens de l'article 32 du RGPD :
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Chiffrement TLS 1.2+ sur toutes les connexions web et API.</li>
          <li>Mots de passe administrateurs et utilisateurs hachés via <strong>scrypt avec sel unique</strong> (impossibles à reverser).</li>
          <li>Support des passkeys (WebAuthn / FIDO2) pour une connexion sans mot de passe.</li>
          <li>Protection CSRF par jeton de session, en-têtes <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">CSP</code>, <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">X-Frame-Options</code>, <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">HSTS</code>, <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">Referrer-Policy</code>.</li>
          <li>Limitation de débit (rate-limiting) sur tous les endpoints sensibles.</li>
          <li>Accès à la base de données restreint au backend, sur réseau privé.</li>
          <li>Sauvegardes chiffrées quotidiennes, conservées 7 jours.</li>
          <li>Surveillance temps réel des erreurs et des tentatives d'intrusion.</li>
        </ul>
      </LegalSection>

      <LegalSection id="cookies" title="8. Cookies & stockage local">
        <p>
          Nous utilisons exclusivement des cookies <strong>strictement
          nécessaires</strong> au fonctionnement du Service, ne nécessitant
          pas de consentement préalable au sens de la délibération CNIL
          n° 2020-091 :
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">sgid</code>
           , cookie de session, HTTP-only, SameSite=Lax, Secure en production. Durée 24 h. Maintient votre connexion.
          </li>
          <li>Jeton CSRF en mémoire navigateur, durée de la session.</li>
          <li>Préférences locales d'interface (thème, langue) stockées en <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">localStorage</code>, non transmises au serveur.</li>
        </ul>
        <p>
          <strong>Aucun cookie publicitaire, analytics tiers ou de profilage</strong> n'est déposé sur nos sites.
        </p>
      </LegalSection>

      <LegalSection id="mineurs" title="9. Mineurs">
        <p>
          Les Services sont destinés aux personnes <strong>âgées de 13 ans
          ou plus</strong> (16 ans dans certains États membres de l'Union
          Européenne, conformément à l'article 8 du RGPD). En cas de
          minorité, l'Utilisateur déclare avoir obtenu l'accord de ses
          parents ou tuteurs légaux.
        </p>
        <p>
          Si vous estimez qu'un mineur de moins de 13 ans nous a fourni des
          données personnelles, contactez-nous immédiatement à
          <strong> contact@shardtwn.fr</strong>, nous procéderons à la
          suppression dans les 30 jours.
        </p>
      </LegalSection>

      <LegalSection id="ia" title="10. Assistante IA Shard">
        <p>
          Shard est notre assistante conversationnelle accessible depuis
          <Link to="/assistant" className="underline mx-1">/assistant</Link>.
          Elle fonctionne sur un <strong>modèle d'IA auto-hébergé</strong>
          (Ollama) sur notre serveur en Allemagne. Aucune requête n'est
          envoyée à des fournisseurs d'IA tiers (OpenAI, Anthropic, Google,
          Mistral…).
        </p>
        <p>
          Les conversations sont conservées <strong>uniquement en mémoire
          process</strong>, indexées par votre identifiant de session, et
          effacées automatiquement après 1 heure d'inactivité ou via le
          bouton « Effacer la conversation ». Elles ne sont
          <strong> jamais stockées en base de données</strong>, jamais
          loggées, jamais utilisées pour entraîner ou réentraîner un modèle.
        </p>
      </LegalSection>

      <LegalSection id="droits" title="11. Vos droits (articles 15 à 22 du RGPD)">
        <p>Vous disposez à tout moment des droits suivants :</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Droit d'accès</strong> (art. 15), copie de vos données.</li>
          <li><strong>Droit de rectification</strong> (art. 16), correction des données inexactes.</li>
          <li><strong>Droit à l'effacement</strong> / « droit à l'oubli » (art. 17).</li>
          <li><strong>Droit à la limitation</strong> du traitement (art. 18).</li>
          <li><strong>Droit à la portabilité</strong> de vos données (art. 20), export structuré.</li>
          <li><strong>Droit d'opposition</strong> au traitement fondé sur l'intérêt légitime (art. 21).</li>
          <li><strong>Droit de retirer votre consentement</strong> à tout moment (révocation OAuth Discord, déconnexion, suppression du compte).</li>
          <li><strong>Droit de définir des directives post-mortem</strong> (art. 85 loi Informatique et Libertés).</li>
        </ul>
        <p>
          Pour exercer un droit, écrivez-nous à <strong>contact@shardtwn.fr</strong>
          en précisant la nature de votre demande. Nous répondons sous
          <strong> un mois</strong> (extensible à trois mois pour les demandes
          complexes, avec notification motivée).
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez
          adresser une réclamation à la
          <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" className="underline mx-1">CNIL</a>
          (3 place de Fontenoy, 75007 Paris) ou à l'autorité de protection
          des données de votre pays de résidence.
        </p>
      </LegalSection>

      <LegalSection id="violation" title="12. Violation de données">
        <p>
          En cas de violation de données à caractère personnel susceptible
          d'engendrer un risque élevé pour vos droits et libertés, nous nous
          engageons à :
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Notifier la <strong>CNIL dans les 72 heures</strong> (art. 33 RGPD).</li>
          <li>Vous notifier <strong>dans les meilleurs délais</strong> (art. 34 RGPD), avec les mesures correctives mises en œuvre et les recommandations de protection.</li>
          <li>Tenir un registre des violations conformément à l'article 33.5.</li>
        </ul>
      </LegalSection>

      <LegalSection id="evolution" title="13. Évolution de la politique">
        <p>
          Cette politique peut être mise à jour pour refléter l'évolution
          des Services, de la législation, ou des meilleures pratiques de
          sécurité. La date de dernière mise à jour est affichée en tête de
          page. Les modifications substantielles sont notifiées par email
          aux Utilisateurs Premium et par bandeau dans le tableau de bord
          au moins 30 jours avant leur entrée en vigueur.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="14. Contact & réclamation">
        <ul className="list-disc pl-5 space-y-2">
          <li>Email Données personnelles : <strong>contact@shardtwn.fr</strong></li>
          <li>Discord : serveur de support officiel (lien sur shardtwn.fr).</li>
          <li>Autorité de contrôle : <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="underline">CNIL</a>, 3 place de Fontenoy, 75007 Paris.</li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
