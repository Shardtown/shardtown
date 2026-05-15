import { Link } from "react-router-dom";
import { LegalPage, LegalSection } from "@/components/layout/LegalPage";

const TOC = [
  { id: "objet", label: "1. Objet" },
  { id: "definitions", label: "2. Définitions" },
  { id: "acceptation", label: "3. Acceptation & formation" },
  { id: "compte", label: "4. Compte utilisateur" },
  { id: "services", label: "5. Services & licence" },
  { id: "usage", label: "6. Usage acceptable" },
  { id: "contenu", label: "7. Contenu utilisateur" },
  { id: "premium", label: "8. Premium & paiement" },
  { id: "retractation", label: "9. Rétractation" },
  { id: "remboursement", label: "10. Remboursement & résiliation" },
  { id: "ip", label: "11. Propriété intellectuelle" },
  { id: "disponibilite", label: "12. Disponibilité « en l'état »" },
  { id: "responsabilite", label: "13. Limitation de responsabilité" },
  { id: "indemnisation", label: "14. Indemnisation" },
  { id: "force-majeure", label: "15. Force majeure" },
  { id: "modifications", label: "16. Modifications" },
  { id: "donnees", label: "17. Données personnelles" },
  { id: "divisibilite", label: "18. Divisibilité & accord intégral" },
  { id: "litiges", label: "19. Litiges & médiation" },
  { id: "droit", label: "20. Droit applicable" },
  { id: "contact", label: "21. Contact" },
];

export function Terms() {
  return (
    <LegalPage
      overline="Légal · CGU"
      title="CGU"
      subtitle="Conditions Générales d'Utilisation des services Shardtown."
      lastUpdated="1er mai 2026"
      toc={TOC}
    >
      <LegalSection id="objet" title="1. Objet">
        <p>
          Les présentes Conditions Générales d'Utilisation (« <strong>CGU</strong> ») régissent
          l'accès et l'utilisation des services proposés par <strong>Shardtown</strong>
          (ci-après « <strong>l'Éditeur</strong> ») via le site
          <a href="https://shardtwn.fr" className="underline mx-1">shardtwn.fr</a>
          et tout sous-domaine, les applications mobiles et desktop éditées
          par Shardtown, le bot Discord Shard, le tableau de bord,
          l'assistante IA Samia, les services en ligne
          et abonnements numériques, ainsi que toute prestation de
          conception, de développement, d'intégration, de configuration ou
          de maintenance fournie par l'Éditeur (ensemble : les
          « <strong>Services</strong> »).
        </p>
        <p>
          En accédant ou en utilisant les Services, vous reconnaissez avoir
          lu, compris et accepté sans réserve les présentes CGU. Si vous
          n'êtes pas d'accord avec l'une de ces stipulations, vous devez
          cesser immédiatement d'utiliser les Services.
        </p>
      </LegalSection>

      <LegalSection id="definitions" title="2. Définitions">
        <p>Pour les besoins des présentes :</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Utilisateur</strong> : toute personne accédant aux Services, qu'elle dispose d'un compte ou non.</li>
          <li><strong>Compte</strong> : l'espace personnel créé via Discord OAuth ou via le système de compte Shardtown (email + mot de passe).</li>
          <li><strong>Serveur</strong> : un serveur Discord sur lequel un bot Shardtown est installé.</li>
          <li><strong>Premium</strong> : l'offre payante débloquant les fonctionnalités avancées des bots, telle que décrite sur la page <Link to="/premium" className="underline">Premium</Link>.</li>
          <li><strong>Contenu utilisateur</strong> : tout texte, configuration, message, image ou donnée fournie par l'Utilisateur via les Services (règles de modération, mots interdits, embeds, etc.).</li>
          <li><strong>Discord</strong> : la plateforme exploitée par Discord Inc., distincte et indépendante de Shardtown.</li>
        </ul>
      </LegalSection>

      <LegalSection id="acceptation" title="3. Acceptation & formation du contrat">
        <p>
          Le contrat est formé dès que l'Utilisateur (i) installe l'un des
          bots sur un serveur Discord, (ii) crée un compte, ou (iii) souscrit
          au Premium. La case d'acceptation lors de l'invitation des bots ou
          de la création du compte vaut acceptation pleine et entière des
          présentes CGU et de la <Link to="/privacy" className="underline">Politique de Confidentialité</Link>.
        </p>
        <p>
          Les Services sont réservés aux personnes <strong>âgées de 13 ans ou plus</strong>
          (16 ans dans certaines juridictions de l'Union Européenne, conformément à
          l'article 8 du RGPD). En cas de minorité, l'Utilisateur déclare avoir
          obtenu l'accord de ses parents ou tuteurs légaux.
        </p>
      </LegalSection>

      <LegalSection id="compte" title="4. Compte utilisateur">
        <p>
          L'Utilisateur est seul responsable de la confidentialité de ses
          identifiants (mot de passe, passkeys, codes de vérification) et de
          toute action effectuée depuis son compte.
        </p>
        <p>
          L'Utilisateur s'engage à fournir des informations exactes et à les
          mettre à jour. Toute usurpation, partage de compte ou création de
          compte au nom d'autrui est interdite.
        </p>
        <p>
          L'Éditeur peut suspendre ou supprimer un compte sans préavis ni
          remboursement en cas de violation manifeste des CGU, des conditions
          d'utilisation de Discord, ou d'usage à des fins illégales.
        </p>
      </LegalSection>

      <LegalSection id="services" title="5. Services & licence d'utilisation">
        <p>
          L'Éditeur concède à l'Utilisateur une licence <strong>personnelle, non-exclusive,
          non-transférable et révocable</strong> d'utilisation des Services pour
          un usage conforme à leur destination. Cette licence n'emporte aucun
          transfert de propriété intellectuelle.
        </p>
        <p>
          L'Éditeur se réserve le droit, à tout moment, de modifier, d'ajouter
          ou de retirer une fonctionnalité, sans que cela ouvre droit à
          indemnisation, sauf à ce que cette suppression rende le Premium
          déjà payé substantiellement inutilisable — auquel cas un remboursement
          au prorata pourra être effectué.
        </p>
      </LegalSection>

      <LegalSection id="usage" title="6. Usage acceptable">
        <p>L'Utilisateur s'engage à <strong>ne pas</strong> :</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Utiliser les Services pour héberger, diffuser ou faciliter du contenu illicite (haine, harcèlement, contenus à caractère sexuel impliquant des mineurs, contrefaçon, malware, etc.).</li>
          <li>Tenter de contourner, désactiver ou compromettre les mesures de sécurité (rate-limiting, captcha, listes noires, vérification).</li>
          <li>Procéder à de l'ingénierie inverse, du scraping massif, du fuzzing ou tout test d'intrusion non autorisé.</li>
          <li>Revendre, sous-licencier, ou exposer les Services à des tiers sans accord écrit préalable.</li>
          <li>Utiliser les bots pour spammer, frauder, harceler ou raider d'autres serveurs Discord.</li>
          <li>Violer les <a href="https://discord.com/terms" target="_blank" rel="noopener noreferrer" className="underline">conditions d'utilisation de Discord</a> ou ses Community Guidelines.</li>
        </ul>
        <p>
          Tout manquement peut entraîner la suspension immédiate des Services,
          sans préavis ni remboursement, et engager la responsabilité civile
          ou pénale de l'Utilisateur.
        </p>
      </LegalSection>

      <LegalSection id="contenu" title="7. Contenu utilisateur">
        <p>
          L'Utilisateur conserve l'intégralité des droits sur son Contenu
          utilisateur. Il concède toutefois à l'Éditeur une licence
          <strong> non-exclusive, gratuite et limitée</strong> aux strictes
          nécessités techniques d'exécution des Services (stockage, affichage,
          transmission via l'API Discord).
        </p>
        <p>
          L'Utilisateur garantit qu'il dispose de tous les droits nécessaires
          sur son Contenu, qu'il ne porte atteinte à aucun droit de tiers et
          qu'il respecte les lois applicables. L'Éditeur n'effectue pas de
          contrôle systématique du Contenu utilisateur mais se réserve le
          droit de le supprimer s'il enfreint manifestement les CGU.
        </p>
      </LegalSection>

      <LegalSection id="premium" title="8. Premium & paiement">
        <p>
          L'offre Premium est facturée selon les tarifs affichés sur la page
          <Link to="/premium" className="underline mx-1">Premium</Link>
          en euros, toutes taxes comprises. Deux formules existent :
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Mensuel</strong> — abonnement automatiquement renouvelé chaque mois jusqu'à résiliation par l'Utilisateur. La résiliation prend effet à la fin de la période en cours.</li>
          <li><strong>À vie</strong> — paiement unique non-renouvelable, attaché au serveur Discord désigné lors de l'achat. « À vie » signifie « tant que les Services existent et restent exploités par l'Éditeur ».</li>
        </ul>
        <p>
          Les paiements sont traités par <strong>Stripe Payments Europe Ltd</strong>
          (Irlande), certifié PCI-DSS. Aucune donnée de carte ne transite ni
          n'est stockée sur les serveurs Shardtown. L'Utilisateur garantit
          être titulaire ou autorisé à utiliser le moyen de paiement employé.
        </p>
        <p>
          En cas d'impayé ou de rétrofacturation (« chargeback »), le Premium
          peut être révoqué immédiatement et un litige peut être ouvert.
        </p>
      </LegalSection>

      <LegalSection id="retractation" title="9. Droit de rétractation (consommateurs)">
        <p>
          Conformément à l'article L.221-18 du Code de la consommation,
          l'Utilisateur consommateur dispose d'un délai de
          <strong> 14 jours</strong> à compter de la souscription pour exercer
          son droit de rétractation, sans avoir à motiver sa décision ni
          supporter de frais autres que ceux prévus par la loi.
        </p>
        <p>
          <strong>Renonciation expresse :</strong> en application de l'article
          L.221-28-13°, l'Utilisateur qui demande l'activation immédiate du
          Premium <strong>renonce expressément</strong> à son droit de
          rétractation pour la part du service déjà exécutée. Cette
          renonciation est obtenue par la case à cocher au moment de la
          souscription.
        </p>
        <p>
          La rétractation s'exerce par email à
          <strong> contact@shardtwn.fr</strong> ou via le formulaire fourni
          en annexe sur demande.
        </p>
      </LegalSection>

      <LegalSection id="remboursement" title="10. Remboursement & résiliation">
        <ul className="list-disc pl-5 space-y-2">
          <li>Toute demande de remboursement éligible est traitée sous 14 jours via Stripe, sur le moyen de paiement initial.</li>
          <li>L'Utilisateur peut résilier son abonnement mensuel à tout moment depuis le portail Stripe (lien dans la page Premium) ou par email. Aucune fraction de mois entamée n'est remboursée hors rétractation légale.</li>
          <li>L'Éditeur peut résilier l'accès aux Services <strong>sans préavis ni remboursement</strong> en cas de violation grave des présentes CGU, d'usage frauduleux, ou de mise en danger de l'infrastructure.</li>
          <li>En cas de cessation des Services par l'Éditeur (faillite, abandon, etc.), un remboursement au prorata des mois non consommés sera effectué dans la mesure des fonds disponibles.</li>
          <li>Les configurations sont conservées 30 jours après le retrait du bot d'un serveur, puis supprimées automatiquement.</li>
        </ul>
      </LegalSection>

      <LegalSection id="ip" title="11. Propriété intellectuelle">
        <p>
          L'ensemble des éléments composant les Services (codes sources, marques
          « Shardtown », « Shard », « Samia », logos, designs,
          textes, illustrations, base de connaissance) est la propriété
          exclusive de l'Éditeur ou de ses concédants, et protégé par le Code
          de la propriété intellectuelle.
        </p>
        <p>
          Toute reproduction, représentation, modification, publication,
          adaptation totale ou partielle est strictement interdite sans
          autorisation écrite préalable, sous peine de poursuites civiles et
          pénales (articles L.335-2 et suivants du CPI).
        </p>
      </LegalSection>

      <LegalSection id="disponibilite" title="12. Disponibilité — service fourni « en l'état »">
        <p>
          Les Services sont fournis « <strong>en l'état</strong> » et « selon
          disponibilité ». L'Éditeur ne garantit pas (i) un fonctionnement
          ininterrompu ou sans erreur, (ii) la compatibilité avec un usage
          particulier, (iii) la persistance des fonctionnalités fournies par
          des tiers (notamment Discord, Stripe, hébergeur), ni (iv) un niveau
          de service (SLA) en dehors d'une éventuelle clause Premium spécifique.
        </p>
        <p>
          Des interruptions peuvent survenir pour maintenance planifiée,
          incident, mise à jour, cyberattaque, ou décision de tiers (suspension
          d'API Discord, blocage Stripe, etc.). L'Éditeur s'efforcera d'en
          minimiser l'impact.
        </p>
      </LegalSection>

      <LegalSection id="responsabilite" title="13. Limitation de responsabilité">
        <p>
          Dans toute la mesure permise par la loi, la responsabilité de
          l'Éditeur ne peut être engagée pour :
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Des dommages <strong>indirects</strong> (perte de chiffre d'affaires, de membres, de réputation, de données, perte d'opportunités).</li>
          <li>Des préjudices résultant d'un usage non conforme aux CGU ou à la documentation.</li>
          <li>Des actes ou omissions de tiers (Discord, Stripe, hébergeur, fournisseur d'IA local, etc.).</li>
          <li>Une attaque, intrusion ou raid mené par des tiers contre un serveur de l'Utilisateur.</li>
        </ul>
        <p>
          En tout état de cause, et hors faute lourde ou intentionnelle de
          l'Éditeur, le montant total cumulé des dommages directs susceptibles
          d'être réclamés à l'Éditeur est <strong>plafonné aux sommes
          effectivement versées par l'Utilisateur au titre des Services au
          cours des douze (12) mois précédant le fait générateur</strong>.
        </p>
      </LegalSection>

      <LegalSection id="indemnisation" title="14. Indemnisation">
        <p>
          L'Utilisateur s'engage à <strong>garantir et indemniser</strong>
          l'Éditeur de toute réclamation, action, condamnation, frais
          (y compris frais d'avocat raisonnables) résultant (i) de son
          Contenu utilisateur, (ii) d'un usage non conforme aux CGU, (iii)
          d'une violation de droits de tiers, ou (iv) d'un manquement aux
          conditions de Discord.
        </p>
      </LegalSection>

      <LegalSection id="force-majeure" title="15. Force majeure">
        <p>
          Aucune Partie ne pourra être tenue responsable de l'inexécution
          d'une obligation due à un cas de force majeure au sens de l'article
          1218 du Code civil, en ce compris notamment : panne réseau d'un
          opérateur tiers, indisponibilité prolongée de l'API Discord,
          décision d'autorité publique, cyberattaque massive, catastrophe
          naturelle, conflit armé, ou pandémie.
        </p>
      </LegalSection>

      <LegalSection id="modifications" title="16. Modifications des CGU">
        <p>
          L'Éditeur se réserve le droit de modifier les présentes CGU à tout
          moment pour s'adapter à l'évolution des Services, à la législation,
          ou à la jurisprudence. Les Utilisateurs Premium sont notifiés
          <strong> 30 jours avant l'entrée en vigueur</strong> des modifications
          substantielles, par email ou bandeau dans le tableau de bord.
        </p>
        <p>
          La poursuite de l'utilisation des Services après l'entrée en vigueur
          des nouvelles CGU vaut acceptation. À défaut, l'Utilisateur peut
          résilier son compte sans frais.
        </p>
      </LegalSection>

      <LegalSection id="donnees" title="17. Données personnelles">
        <p>
          Le traitement des données personnelles est régi par la
          <Link to="/privacy" className="underline mx-1">Politique de Confidentialité</Link>
          qui fait partie intégrante des présentes CGU. L'Utilisateur
          reconnaît en avoir pris connaissance avant son acceptation.
        </p>
      </LegalSection>

      <LegalSection id="divisibilite" title="18. Divisibilité & accord intégral">
        <p>
          Si une stipulation des présentes CGU est jugée invalide, illégale
          ou inopposable par un tribunal compétent, les autres stipulations
          conservent leur plein effet. La clause concernée sera réputée
          remplacée par une stipulation valable s'en rapprochant le plus
          possible quant à l'intention initiale des Parties.
        </p>
        <p>
          Les CGU, ensemble avec la Politique de Confidentialité et toute
          condition spécifique acceptée lors de la souscription Premium,
          constituent <strong>l'intégralité de l'accord</strong> entre les
          Parties relatif aux Services et remplacent tout accord antérieur.
        </p>
      </LegalSection>

      <LegalSection id="litiges" title="19. Litiges & médiation de la consommation">
        <p>
          En cas de litige, l'Utilisateur est invité à contacter d'abord
          l'Éditeur à <strong>contact@shardtwn.fr</strong> afin de rechercher
          une solution amiable.
        </p>
        <p>
          Conformément aux articles L.611-1 et suivants du Code de la
          consommation, l'Utilisateur consommateur peut, à défaut de solution
          amiable dans un délai de 60 jours, recourir gratuitement au
          dispositif de médiation de la consommation. Le médiateur compétent
          est précisé sur demande auprès du contact ci-dessus. L'Utilisateur
          dispose également d'un accès à la
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="underline mx-1">plateforme européenne de résolution des litiges en ligne</a>.
        </p>
      </LegalSection>

      <LegalSection id="droit" title="20. Droit applicable & juridiction">
        <p>
          Les présentes CGU sont régies par le <strong>droit français</strong>.
          Tout litige n'ayant pu être réglé à l'amiable ou par médiation
          relèvera de la compétence exclusive des juridictions françaises,
          sous réserve des règles impératives applicables aux consommateurs
          résidant dans un autre État membre de l'Union Européenne.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="21. Contact">
        <p>
          Pour toute question, demande ou notification :
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Email : <strong>contact@shardtwn.fr</strong></li>
          <li>Discord : serveur de support officiel (lien sur shardtwn.fr).</li>
          <li>Assistante IA : <Link to="/assistant" className="underline">Samia</Link> pour les questions générales.</li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
