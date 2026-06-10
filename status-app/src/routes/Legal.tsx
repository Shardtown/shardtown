import { LegalPage, LegalSection } from "@/components/layout/LegalPage";

const TOC = [
  { id: "editeur",      label: "1. Éditeur du site" },
  { id: "publication",  label: "2. Directeur de la publication" },
  { id: "hebergeur",    label: "3. Hébergeur" },
  { id: "ip",           label: "4. Propriété intellectuelle" },
  { id: "liens",        label: "5. Liens hypertextes" },
  { id: "responsabilite", label: "6. Limitation de responsabilité" },
  { id: "droit",        label: "7. Droit applicable" },
];

export function Legal() {
  return (
    <LegalPage
      overline="Légal · Mentions légales"
      title="MENTIONS LÉGALES"
      subtitle="Informations légales relatives à l'édition et l'hébergement du site shardtwn.fr, conformément à la loi n° 2004-575 du 21 juin 2004 pour la Confiance dans l'Économie Numérique (LCEN)."
      lastUpdated="10 juin 2026"
      toc={TOC}
    >
      <LegalSection id="editeur" title="1. Éditeur du site">
        <p>
          Le site <strong>shardtwn.fr</strong> et ses sous-domaines sont édités par{" "}
          <strong>Shardtown</strong>, personne physique non-professionnelle
          (particulier).
        </p>
        <p>
          Conformément à l'article 6-III-2 de la loi n° 2004-575 du 21 juin 2004
          (LCEN), l'éditeur a communiqué ses coordonnées personnelles complètes
          (nom, prénom, adresse) à l'hébergeur. Ces informations restent
          confidentielles vis-à-vis du public, mais sont disponibles sur demande
          motivée des autorités judiciaires ou administratives compétentes.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Dénomination</strong> : Shardtown
          </li>
          <li>
            <strong>Statut</strong> : Particulier non-professionnel
          </li>
          <li>
            <strong>Contact</strong> :{" "}
            <a href="mailto:contact@shardtwn.fr" className="underline">
              contact@shardtwn.fr
            </a>
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="publication" title="2. Directeur de la publication">
        <p>
          Le directeur de la publication est la personne physique éditrice du
          site, identifiée auprès de l'hébergeur. Les demandes relatives à la
          publication peuvent être adressées à{" "}
          <a href="mailto:contact@shardtwn.fr" className="underline">
            contact@shardtwn.fr
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="hebergeur" title="3. Hébergeur">
        <p>Le site est hébergé par :</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Raison sociale</strong> : Winheberg
          </li>
          <li>
            <strong>Pays</strong> : France
          </li>
          <li>
            <strong>Site web</strong> :{" "}
            <a
              href="https://www.winheberg.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              winheberg.fr
            </a>
          </li>
          <li>
            <strong>Contact hébergeur</strong> :{" "}
            <a
              href="https://www.winheberg.fr/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Formulaire de contact Winheberg
            </a>
          </li>
        </ul>
        <p>
          Conformément à l'article 6-I-2 de la LCEN, l'hébergeur dispose des
          coordonnées personnelles de l'éditeur du site.
        </p>
      </LegalSection>

      <LegalSection id="ip" title="4. Propriété intellectuelle">
        <p>
          L'ensemble des contenus présents sur <strong>shardtwn.fr</strong>
          (textes, logos, graphismes, code source, bots Discord, icônes,
          dénominations « Shardtown » et « Shard ») est protégé par le droit
          de la propriété intellectuelle, et notamment par le Code de la
          propriété intellectuelle français (articles L.111-1 et suivants).
        </p>
        <p>
          Toute reproduction, représentation, modification, publication ou
          adaptation de tout ou partie des contenus, quel qu'en soit le moyen
          ou le procédé, est interdite sans autorisation écrite préalable de
          l'éditeur, sous peine de poursuites judiciaires conformément aux
          articles L.335-2 et suivants du Code de la propriété intellectuelle.
        </p>
        <p>
          Les marques et logos de Discord, Stripe et autres tiers mentionnés
          sur ce site restent la propriété exclusive de leurs titulaires
          respectifs. Leur mention n'emporte aucun transfert de droits.
        </p>
      </LegalSection>

      <LegalSection id="liens" title="5. Liens hypertextes">
        <p>
          Le site peut contenir des liens vers des sites tiers (Discord,
          Stripe, etc.). Ces liens sont fournis à titre informatif. Shardtown
          n'exerce aucun contrôle sur le contenu de ces sites et décline toute
          responsabilité quant à leur disponibilité, leur exactitude ou leurs
          pratiques en matière de données personnelles.
        </p>
        <p>
          Tout lien hypertexte pointant vers le présent site doit faire l'objet
          d'une autorisation préalable écrite de l'éditeur. Les liens en
          cadre (<em>frames</em>) sont interdits.
        </p>
      </LegalSection>

      <LegalSection id="responsabilite" title="6. Limitation de responsabilité">
        <p>
          Les informations publiées sur ce site sont fournies à titre indicatif.
          Shardtown ne garantit pas l'exactitude, la complétude ou l'actualité
          de ces informations et ne saurait être tenu responsable de décisions
          prises sur leur base.
        </p>
        <p>
          Shardtown décline toute responsabilité pour les dommages directs ou
          indirects résultant de l'accès ou de l'utilisation du site, de
          l'impossibilité d'y accéder, des erreurs ou omissions dans son
          contenu, ou de l'utilisation de sites tiers vers lesquels il renvoie.
        </p>
        <p>
          Les services sont fournis « en l'état » conformément aux{" "}
          <a href="/terms" className="underline">
            Conditions Générales d'Utilisation
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="droit" title="7. Droit applicable & juridiction">
        <p>
          Les présentes mentions légales sont régies par le{" "}
          <strong>droit français</strong>. Tout litige relatif à leur
          interprétation ou à leur exécution relève de la compétence exclusive
          des juridictions françaises.
        </p>
        <p>
          Pour tout signalement de contenu illicite au sens de l'article 6-I-7
          de la LCEN, contactez-nous à{" "}
          <a href="mailto:contact@shardtwn.fr" className="underline">
            contact@shardtwn.fr
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
