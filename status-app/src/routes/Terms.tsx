import { Link } from "react-router-dom";
import { LegalPage, LegalSection } from "@/components/layout/LegalPage";

export function Terms() {
  return (
    <LegalPage label="Légal" title="Conditions Générales d'Utilisation">
      <LegalSection title="1. Objet et Acceptation">
        <p>
          Les présentes Conditions Générales d'Utilisation (CGU) ont pour objet de définir les modalités de
          mise à disposition des services de Shardtown. L'utilisation de l'un de nos services ou produits
          implique l'acceptation pleine et entière de l'ensemble des conditions décrites ci-après.
        </p>
      </LegalSection>

      <LegalSection title="2. Services et Produits Shardtown">
        <p>
          Shardtown propose un écosystème de solutions digitales incluant, sans s'y limiter, des outils de
          sécurisation (ShardGuard), des systèmes d'automatisation, des services de configuration et de
          développement sur mesure.
        </p>
        <p>
          Les fonctionnalités et modalités d'accès varient selon le produit ou service choisi. Shardtown se
          réserve le droit de modifier, d'ajouter ou de supprimer des fonctionnalités à tout moment pour
          améliorer l'expérience utilisateur ou assurer la sécurité de l'infrastructure.
        </p>
      </LegalSection>

      <LegalSection title="3. Obligations de l'Utilisateur">
        <p>L'utilisateur s'engage à :</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Utiliser les services conformément aux lois en vigueur et aux conditions des plateformes tierces partenaires (ex: Discord).</li>
          <li>Ne pas tenter de détourner l'usage initial des outils ou de porter atteinte à l'intégrité technique de l'écosystème.</li>
          <li>Assumer la responsabilité de la configuration et de l'usage fait des produits Shardtown au sein de ses propres structures ou communautés.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Propriété Intellectuelle">
        <p>
          L'ensemble du contenu, des marques, des logos, des codes sources et des graphismes associés aux
          projets Shardtown sont la propriété exclusive de Shardtown. Toute exploitation non autorisée est
          passible de poursuites.
        </p>
      </LegalSection>

      <LegalSection title="5. Limitation de Responsabilité">
        <p>
          Shardtown s'efforce de fournir des services de haute qualité et sécurisés. Toutefois, nous ne
          pouvons garantir l'absence totale d'interruptions ou de vulnérabilités externes. Shardtown ne
          saurait être tenu responsable des dommages indirects, pertes de données ou préjudices financiers
          liés à l'usage de ses solutions.
        </p>
      </LegalSection>

      <LegalSection title="6. Modalités Financières et Paiement">
        <p>
          Certaines fonctionnalités (offre <strong>Premium</strong>) sont payantes. Les tarifs sont indiqués
          sur la page <Link to="/premium" className="underline">Premium</Link> au moment de la souscription,
          en euros, toutes taxes comprises le cas échéant.
        </p>
        <p>
          Les paiements sont traités par <strong>Stripe Payments Europe Ltd</strong>, certifié PCI-DSS.
          Aucune donnée de carte bancaire ne transite par les serveurs Shardtown. Deux formules sont proposées :
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Mensuel</strong> — abonnement renouvelable mensuellement, résiliable à tout moment depuis votre interface ou en nous contactant. La résiliation prend effet à la fin de la période en cours, déjà payée.</li>
          <li><strong>À vie</strong> — paiement unique non-renouvelable, valable pour le serveur Discord désigné lors de l'achat.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Droit de Rétractation">
        <p>
          Conformément à l'article L.221-18 du Code de la consommation, vous disposez d'un délai de
          <strong> 14 jours</strong> à compter de la date de paiement pour exercer votre droit de rétractation,
          sans avoir à motiver votre décision.
        </p>
        <p>
          <strong>Exception :</strong> en application de l'article L.221-28-13°, en commandant un service
          Premium et en demandant son activation immédiate, vous renoncez expressément à votre droit de
          rétractation pour la partie du service déjà exécutée. Toute fraction d'abonnement déjà consommée ne
          pourra faire l'objet d'un remboursement.
        </p>
        <p>
          Pour exercer votre droit de rétractation : contactez-nous via Discord ou par email avant
          l'expiration du délai de 14 jours.
        </p>
      </LegalSection>

      <LegalSection title="8. Remboursement et Résiliation">
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Toute demande de remboursement éligible est traitée sous 14 jours via Stripe.</li>
          <li>Shardtown se réserve le droit de suspendre ou résilier sans préavis ni remboursement tout compte ou serveur ne respectant pas les présentes CGU, ou utilisé à des fins illégales, abusives ou contraires aux conditions de Discord.</li>
          <li>En cas de résiliation par l'utilisateur, les fonctionnalités Premium restent disponibles jusqu'à la fin de la période payée. Les données de configuration sont conservées 30 jours après suppression du bot, puis supprimées.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Service Fourni « En l'État »">
        <p>
          Shardtown s'efforce de fournir des services de haute qualité et sécurisés. Toutefois, nous ne
          pouvons garantir l'absence totale d'interruptions, de bugs ou de vulnérabilités externes liées
          notamment à l'API Discord ou à nos sous-traitants. Aucune garantie de disponibilité (SLA) n'est
          offerte hors offre Premium spécifique. Shardtown ne saurait être tenu responsable des dommages
          indirects, pertes de données, pertes de revenus ou préjudices financiers liés à l'usage de ses
          solutions.
        </p>
      </LegalSection>

      <LegalSection title="10. Modification des CGU">
        <p>
          Shardtown se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs Premium
          seront notifiés par email ou via le panel des modifications substantielles 30 jours avant leur
          entrée en vigueur. Dernière mise à jour : avril 2026.
        </p>
      </LegalSection>

      <LegalSection title="11. Droit Applicable et Juridiction">
        <p>
          Les présentes CGU sont régies par le droit français. Tout litige relatif à leur interprétation ou
          leur exécution relève de la compétence exclusive des tribunaux français, sous réserve des règles
          impératives applicables aux consommateurs résidant dans l'Union Européenne.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
