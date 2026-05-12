import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, ArrowRight, Hash, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { Admonition } from "@/components/ui/admonition";

/* ─────────────────────────────────────────────────────────────
   Wiki content — single source of truth
   ─────────────────────────────────────────────────────────────
   Each section has a stable id (used for #anchor + sidebar),
   a group (used to organize sidebar), a title and a body that
   renders structured content (intro / settings / steps / notes).
   ───────────────────────────────────────────────────────────── */

type Setting = {
  field: string;
  type?: string;
  desc: string;
  premium?: boolean;
};

type Note =
  | { kind: "tip"; title?: string; body: string }
  | { kind: "info"; title?: string; body: string }
  | { kind: "warning"; title?: string; body: string }
  | { kind: "premium"; title?: string; body: string };

interface Section {
  id: string;
  group: "Démarrage" | "ShardGuard" | "Shard" | "Compte & Premium" | "Référence";
  title: string;
  tagline: string;
  /** Plain-text intro, 1-3 short paragraphs. */
  intro: string[];
  /** Bullet list of configurable settings. */
  settings?: Setting[];
  /** Numbered "How to set up" steps. */
  steps?: string[];
  /** Notes / admonitions appended to the section. */
  notes?: Note[];
  /** Free-text examples or "see also" line. */
  seeAlso?: { id: string; label: string }[];
}

const SECTIONS: Section[] = [
  /* ───────── Démarrage ───────── */
  {
    id: "introduction",
    group: "Démarrage",
    title: "Bienvenue sur Shardtown",
    tagline: "Deux bots Discord, un seul écosystème, zéro commande à apprendre.",
    intro: [
      "Shardtown réunit deux bots Discord complémentaires : ShardGuard pour la sécurité et la modération, Shard pour la communauté et l'engagement. Ils partagent le même dashboard, le même compte et le même Premium.",
      "Toute la configuration se fait depuis le web — pas de commandes à apprendre par cœur, pas de fichier à éditer. Tu cliques, tu sauvegardes, le bot applique en moins d'une seconde.",
      "Ce wiki documente chaque module avec : ce qu'il fait, les paramètres exacts disponibles, les étapes pour le configurer, et les pièges à éviter.",
    ],
    notes: [
      { kind: "tip", title: "Lis ces 3 sections en premier", body: "Ajouter les bots → Premiers pas → puis le module qui t'intéresse. Le reste est consultable à la demande." },
    ],
  },
  {
    id: "add-bots",
    group: "Démarrage",
    title: "Ajouter les bots à ton serveur",
    tagline: "Inviter ShardGuard et/ou Shard avec les bonnes permissions.",
    intro: [
      "Les deux bots s'invitent indépendamment via les liens d'invitation Discord officiels. Ils demandent les permissions dont ils ont besoin pour fonctionner — accepte-les en bloc, sinon certaines fonctionnalités tomberont en silence.",
      "Tu peux n'installer qu'un seul bot si tu n'as besoin que d'une moitié des fonctionnalités, mais ils sont conçus pour cohabiter sans conflit.",
    ],
    steps: [
      "Connecte-toi sur shardtwn.fr avec ton compte Discord (le même qui administre le serveur cible).",
      "Va dans le Dashboard → onglet Mes serveurs et clique sur « Inviter le bot ».",
      "Discord ouvre un écran d'autorisation : confirme avec ton serveur sélectionné dans le menu déroulant.",
      "Garde la case « Administrateur » cochée si elle apparaît — elle évite les erreurs de permission au lancement.",
      "De retour sur le dashboard, le serveur apparaît dans la liste et tu peux ouvrir sa config.",
    ],
    notes: [
      { kind: "warning", title: "Ne décoche pas les permissions", body: "Si tu refuses « Gérer les rôles » ou « Modérer les membres », ShardGuard ne pourra pas attribuer le rôle vérifié ni mute/kick. Le bot fonctionnera mais sans les actions clés." },
      { kind: "info", title: "Position du rôle du bot", body: "Le rôle du bot doit être au-dessus de tous les rôles qu'il manipule (verifié, quarantaine, etc.) dans Paramètres serveur → Rôles. Discord refuse les actions sur des rôles supérieurs." },
    ],
  },
  {
    id: "first-steps",
    group: "Démarrage",
    title: "Premiers pas",
    tagline: "Le minimum vital pour qu'un nouveau membre puisse rejoindre proprement.",
    intro: [
      "Si tu n'as que 5 minutes pour configurer Shardtown, voici ce que je te conseille de faire — ça couvre 80 % des cas et tu pourras affiner plus tard.",
    ],
    steps: [
      "ShardGuard → Général : choisis le salon de vérification (où le captcha sera envoyé) et le rôle vérifié (attribué après réussite).",
      "ShardGuard → Captcha : laisse les valeurs par défaut (6 chiffres, bruit moyen, 3 essais, 15 min). Active « auto-kick » si tu veux que les non-vérifiés partent tout seuls.",
      "ShardGuard → Règlement : ajoute 3-5 règles courtes, en français et en anglais (les deux versions sont obligatoires).",
      "Shard → Bienvenue & Départ : sélectionne le salon d'accueil et personnalise le message — utilise {user} pour mentionner et {memberCount} pour le compteur.",
      "Shard → Auto-rôle : choisis un rôle « Membre » à donner automatiquement aux arrivants vérifiés.",
    ],
    notes: [
      { kind: "tip", title: "Teste avant d'ouvrir", body: "Crée un compte Discord secondaire et rejoins ton serveur pour voir tout le flux : captcha → rôle vérifié → message de bienvenue → auto-rôle. Ajuste si quelque chose ne déclenche pas." },
    ],
    seeAlso: [
      { id: "captcha", label: "Détails du captcha" },
      { id: "welcome", label: "Variables des messages" },
    ],
  },

  /* ───────── ShardGuard ───────── */
  {
    id: "shardguard-overview",
    group: "ShardGuard",
    title: "Vue d'ensemble — ShardGuard",
    tagline: "Sécurité, vérification et modération sans configuration manuelle.",
    intro: [
      "ShardGuard couvre tout ce qui touche à la sécurité du serveur : captcha de vérification à l'arrivée, anti-raid, modération automatique, sanctions progressives, mode panic, statistiques d'arrivées et logs détaillés.",
      "Les modules sont indépendants : tu peux activer uniquement ce qui te concerne. La plupart sont gratuits ; quelques options avancées sont réservées au Premium.",
    ],
  },
  {
    id: "general",
    group: "ShardGuard",
    title: "Général · Vérification & verrouillage",
    tagline: "Le squelette de ShardGuard : où, par qui, avec quel rôle.",
    intro: [
      "Onglet « Général » du dashboard ShardGuard. C'est ici qu'on dit au bot quel salon utiliser pour la vérification, quel rôle attribuer aux membres validés, et si le serveur doit être verrouillé.",
    ],
    settings: [
      { field: "verificationChannelId", desc: "Salon où le bot enverra le captcha aux nouveaux. Crée un salon dédié, en lecture seule pour @everyone." },
      { field: "verifiedRole", desc: "Rôle attribué automatiquement après réussite du captcha. C'est ce rôle qui doit débloquer le reste du serveur." },
      { field: "language", type: "fr | en", desc: "Langue des messages du bot envoyés aux nouveaux." },
      { field: "serverLocked", type: "true | false", desc: "Si true, le bot empêche toute nouvelle arrivée sauf via code d'accès." },
      { field: "accessCode", type: "texte libre", desc: "Code requis pour rejoindre quand le serveur est verrouillé. Vide = accès libre." },
    ],
    steps: [
      "Crée le salon « ✅-vérification » et donne lecture/écriture seulement à @everyone (le bot a déjà tous les droits).",
      "Crée le rôle « Membre vérifié » et place-le sous le rôle du bot dans la hiérarchie.",
      "Onglet Général → sélectionne ces deux dans les dropdowns.",
      "Choisis la langue, garde « serveur verrouillé » sur Ouvert pour commencer.",
    ],
    notes: [
      { kind: "warning", title: "Hiérarchie des rôles", body: "Si le rôle du bot est sous le rôle vérifié, Discord refusera l'attribution. Vérifie l'ordre dans Paramètres serveur → Rôles." },
    ],
  },
  {
    id: "captcha",
    group: "ShardGuard",
    title: "Captcha de vérification",
    tagline: "Filtre les selfbots et bots malveillants à l'entrée.",
    intro: [
      "Quand un nouveau membre rejoint, le bot lui envoie une image avec une suite de chiffres bruitée, dans le salon de vérification. Le membre tape les chiffres ; si c'est correct, il reçoit le rôle vérifié.",
      "Plus le bruit est élevé, plus le captcha est difficile à automatiser, mais plus les humains se trompent aussi. La valeur médiane (Moyen) marche pour 99 % des serveurs.",
    ],
    settings: [
      { field: "captchaDigits", type: "4-8", desc: "Nombre de chiffres à taper. 6 est un bon compromis." },
      { field: "captchaNoise", type: "low | medium | high", desc: "Niveau de bruit visuel sur l'image. Élevé = plus dur à OCR mais plus dur pour les humains." },
      { field: "captchaAttempts", type: "1-5", desc: "Nombre d'essais avant échec définitif." },
      { field: "verificationTimeout", type: "5-60 min", desc: "Temps laissé pour valider avant que le bot considère l'utilisateur comme non vérifié." },
      { field: "autoKickUnverified", type: "true | false", desc: "Si true, kick automatique en fin de timeout. Sinon il reste sans rôle vérifié." },
    ],
    notes: [
      { kind: "tip", title: "Bonne config par défaut", body: "6 chiffres, bruit moyen, 3 essais, 15 minutes, auto-kick activé. C'est ce qui filtre 99 % des bots sans frustrer les humains." },
      { kind: "warning", title: "Auto-kick et logs", body: "Si tu actives l'auto-kick, surveille la liste Logs pour vérifier que tu ne perds pas trop de vrais membres. Trop d'auto-kick = captcha trop dur." },
    ],
  },
  {
    id: "rules",
    group: "ShardGuard",
    title: "Règlement",
    tagline: "Les règles affichées dans le message de vérification.",
    intro: [
      "Les règles que tu définis ici apparaissent dans le message envoyé au nouveau membre, juste avant le captcha. C'est aussi le contenu accepté implicitement par la validation.",
      "Tu dois fournir une version en français et une en anglais — le bot affiche celle qui correspond à la langue choisie dans Général.",
    ],
    steps: [
      "Onglet Règlement → onglet « Français » : clique « + Ajouter une règle » et tape ta première règle.",
      "Garde-les courtes (une phrase). 5-7 règles c'est l'optimum lisible.",
      "Bascule sur l'onglet « English » et duplique en anglais — ne saute pas cette étape, sinon les anglophones verront un règlement vide.",
      "Sauvegarde.",
    ],
    notes: [
      { kind: "tip", title: "Inspiration de règles", body: "Respect mutuel · Pas de spam ni de pub · Pas de NSFW hors salons dédiés · Pseudo lisible · Discord ToS s'applique. Tu peux copier-coller." },
    ],
  },
  {
    id: "security",
    group: "ShardGuard",
    title: "Sécurité · Anti-raid & Quarantaine",
    tagline: "Détecte les vagues d'arrivées anormales et confine les suspects.",
    intro: [
      "Le module Sécurité surveille la fréquence d'arrivée. Si N membres rejoignent en moins de M secondes, c'est un raid : le bot peut alors verrouiller le serveur, mettre les arrivants en quarantaine, ou alerter les modérateurs.",
      "C'est le filet de sécurité pour les soirs où ton serveur est ciblé. Combiné au captcha, ça rend une attaque coordonnée extrêmement coûteuse à monter.",
    ],
    settings: [
      { field: "antiRaidEnabled", type: "0 | 1", desc: "Active la détection." },
      { field: "antiRaidThreshold", type: "2-100", desc: "Nombre d'arrivées qui déclenche l'alerte." },
      { field: "antiRaidWindow", type: "3-300 s", desc: "Fenêtre de temps en secondes pour compter les arrivées." },
      { field: "quarantineEnabled", type: "0 | 1", desc: "Active le mode quarantaine pour les membres détectés." },
      { field: "quarantineRoleId", desc: "Rôle de quarantaine (en lecture seule sur le serveur)." },
      { field: "quarantineDuration", type: "1-1440 min", desc: "Durée pendant laquelle le rôle quarantaine est appliqué." },
    ],
    steps: [
      "Crée un rôle « Quarantaine » sans aucune permission visible.",
      "Configure les overwrites de tous tes salons pour cacher leur contenu à ce rôle (sauf un éventuel salon « tampon »).",
      "Onglet Sécurité → active anti-raid, mets seuil 10 / fenêtre 10 s pour un serveur moyen.",
      "Active la quarantaine et sélectionne le rôle créé. Durée 60 min suffit dans la plupart des cas.",
    ],
    notes: [
      { kind: "info", title: "Deux couches d'anti-raid", body: "Cet onglet gère la couche « première arrivée ». Une seconde couche existe dans Automod pour les comportements suspects après vérification." },
    ],
  },
  {
    id: "warns",
    group: "ShardGuard",
    title: "Avertissements",
    tagline: "Sanctions automatiques en fonction du nombre de warns.",
    intro: [
      "Tes modérateurs distribuent des warns aux membres qui débordent. Au lieu de gérer les sanctions à la main, ShardGuard applique mute/kick/ban automatiquement quand un seuil est atteint.",
      "Tu définis 3 seuils : combien de warns pour mute, combien pour kick, combien pour ban. Mettre 0 désactive le seuil correspondant.",
    ],
    settings: [
      { field: "warnThresholdMute", type: "≥ 0", desc: "Nombre de warns qui déclenche un mute. 0 = désactivé." },
      { field: "warnMuteDuration", type: "minutes", desc: "Durée du mute déclenché." },
      { field: "warnThresholdKick", type: "≥ 0", desc: "Nombre de warns qui déclenche un kick. 0 = désactivé." },
      { field: "warnThresholdBan", type: "≥ 0", desc: "Nombre de warns qui déclenche un ban. 0 = désactivé." },
      { field: "notifAutoDelete", type: "true | false", desc: "Si true, les notifications de sanction s'auto-suppriment." },
      { field: "notifDeleteDelay", type: "1-60 s", desc: "Délai avant suppression des notifications." },
    ],
    notes: [
      { kind: "tip", title: "Échelle classique", body: "Mute à 2 warns (60 min), kick à 4, ban à 6. Suffisamment progressif pour laisser une chance, suffisamment ferme pour les récidivistes." },
    ],
  },
  {
    id: "modroles",
    group: "ShardGuard",
    title: "Rôles modérateurs",
    tagline: "Qui peut utiliser les commandes de modération du bot.",
    intro: [
      "Sélectionne les rôles dont les membres peuvent appliquer warn / mute / kick / ban via le bot. Tous les autres rôles n'auront aucun accès aux commandes.",
      "Discord garde le contrôle des permissions natives — cette liste n'autorise que les commandes du bot.",
    ],
    steps: [
      "Onglet Modérateurs → clique sur les rôles à autoriser dans la grille.",
      "Les rôles sélectionnés deviennent bleus.",
      "Sauvegarde.",
    ],
  },
  {
    id: "banned",
    group: "ShardGuard",
    title: "Mots interdits",
    tagline: "Filtre automatique de messages contenant certains mots.",
    intro: [
      "Liste de mots / expressions à filtrer. Quand un message contient un de ces mots, le bot applique l'action choisie : suppression, warn, mute, kick ou ban.",
      "Le filtre est insensible à la casse. Les jokers `*` sont supportés : `spam*` matche « spam », « spammer », « spamming »…",
    ],
    settings: [
      { field: "bannedWordsEnabled", type: "true | false", desc: "Active/désactive globalement le filtre." },
      { field: "bannedWordsAction", type: "delete | warn | mute | kick | ban", desc: "Action appliquée quand un mot est détecté." },
      { field: "bannedWords", type: "tableau de chaînes", desc: "Liste des mots ou patterns interdits." },
    ],
    steps: [
      "Active le filtre.",
      "Choisis l'action (suppression simple par défaut, plus strict si récidive).",
      "Ajoute les mots un par un, ou utilise « Importer en masse » et colle une liste (un mot par ligne).",
    ],
    notes: [
      { kind: "info", title: "Limite Free vs Premium", body: "Plan gratuit : 3 mots maximum. Premium : illimité. Voir la page Premium pour les détails." },
    ],
  },
  {
    id: "automod",
    group: "ShardGuard",
    title: "Automod",
    tagline: "Anti-spam, anti-liens, anti-MAJUSCULES, anti-raid niveau 2, slowmode auto.",
    intro: [
      "Automod regroupe 5 sous-modules indépendants qui surveillent les comportements une fois la vérification passée. Chacun s'active séparément avec ses propres seuils et son action.",
    ],
    settings: [
      { field: "automodAntiSpam", desc: "Détecte N messages en T secondes par un même utilisateur." },
      { field: "automodAntiLinks", desc: "Bloque les liens (sauf whitelist Discord)." },
      { field: "automodAntiCaps", desc: "Bloque les messages avec un % de majuscules supérieur au seuil." },
      { field: "automodAntiRaid", desc: "Couche secondaire de détection raid (basée sur l'activité, pas les arrivées)." },
      { field: "automodSlowmodeEnabled", desc: "Active automatiquement un slowmode quand l'activité explose." },
    ],
    notes: [
      { kind: "tip", title: "Active progressivement", body: "Commence avec anti-spam seul. Si tu vois passer beaucoup de pubs, active anti-liens. Anti-caps est utile sur les serveurs gaming. Slowmode auto est fait pour les annonces virales." },
    ],
  },
  {
    id: "panic",
    group: "ShardGuard",
    title: "Mode Panic",
    tagline: "Bouton d'urgence : verrouille tout en une action.",
    intro: [
      "Un seul bouton dans l'onglet Mode Panic. Quand tu cliques, le bot coupe les invitations, restreint l'envoi de messages aux nouveaux membres, et te confirme l'action.",
      "C'est conçu pour les attaques en cours : pas de paramétrage, pas de réflexion. Tu cliques, tu reprends le contrôle, tu désactives plus tard.",
    ],
    notes: [
      { kind: "warning", title: "C'est une action manuelle", body: "Le mode panic n'est pas automatique — c'est un kill switch. Pour une réaction automatique, configure plutôt Anti-raid / Quarantaine." },
    ],
  },
  {
    id: "stats-logs",
    group: "ShardGuard",
    title: "Statistiques · Logs · Membres",
    tagline: "Surveiller ce qui se passe vraiment, pas juste ce que tu configures.",
    intro: [
      "Trois onglets « lecture seule » qui te donnent l'historique réel des événements. Aucune configuration, juste de la donnée.",
      "Statistiques : graphes 14 jours d'arrivées, départs, captchas réussis et échoués. Utile pour repérer une vague de raid passée inaperçue ou un captcha trop dur.",
      "Logs : derniers événements (vérifications, sanctions, départs) avec filtres par type et statut. Recherche par pseudo ou ID.",
      "Membres : liste recherchable de tous tes membres avec leurs warns, mutes, dates d'arrivée. Clic sur un membre = actions rapides (warn / mute / kick / ban).",
    ],
  },

  /* ───────── Shard ───────── */
  {
    id: "shard-overview",
    group: "Shard",
    title: "Vue d'ensemble — Shard",
    tagline: "Communauté, engagement, fun. Tout est désactivable.",
    intro: [
      "Shard est ton bot communautaire : messages d'accueil, niveaux, économie virtuelle, giveaways, sondages, tickets, anniversaires, vocaux temporaires, embeds personnalisés…",
      "Chaque module se gère indépendamment depuis le dashboard. Tu peux n'en activer qu'un seul ou les vingt — pas d'interdépendance forcée.",
    ],
  },
  {
    id: "welcome",
    group: "Shard",
    title: "Arrivée & Départ",
    tagline: "Messages d'accueil et d'au revoir personnalisables.",
    intro: [
      "Quand un membre rejoint le serveur, Shard envoie un embed dans le salon de ton choix avec le titre, le message, le pied de page et la couleur que tu définis. Idem quand un membre part.",
      "Les variables sont remplacées à la volée : `{user}` mentionne le membre, `{username}` affiche son pseudo, `{server}` le nom du serveur, `{memberCount}` le nombre total de membres.",
    ],
    settings: [
      { field: "welcomeChannelId", desc: "Salon de l'embed d'accueil." },
      { field: "welcomeTitle / welcomeMessage / welcomeFooter", desc: "Texte de l'embed. Variables supportées." },
      { field: "welcomeColor", desc: "Couleur de la bordure latérale de l'embed (hex)." },
      { field: "leaveChannelId / leaveTitle / leaveMessage / leaveFooter / leaveColor", desc: "Mêmes options pour le départ. Peut être un salon différent." },
    ],
    notes: [
      { kind: "tip", title: "Bouton « Tester » du dashboard", body: "Pas besoin d'attendre un nouveau membre pour vérifier — clique sur Tester dans l'onglet pour envoyer le message dans le salon configuré." },
    ],
  },
  {
    id: "autorole",
    group: "Shard",
    title: "Auto-rôle",
    tagline: "Donner un rôle automatiquement à chaque arrivant.",
    intro: [
      "Sélectionne un rôle qui sera attribué à tous les nouveaux membres dès leur arrivée. Idéal pour un rôle « Membre » qui débloque les salons de base.",
      "Si tu utilises ShardGuard avec captcha, attends que le membre soit vérifié avant de lui donner ce rôle (combine avec le rôle vérifié).",
    ],
  },
  {
    id: "birthdays",
    group: "Shard",
    title: "Anniversaires",
    tagline: "Annonces auto + rôle anniversaire de 24 h.",
    intro: [
      "Les membres enregistrent leur date d'anniversaire via une commande (sans l'année — Shard respecte la vie privée). Chaque jour à minuit UTC, Shard cherche les anniversaires du jour, envoie un message dans le salon configuré et attribue un rôle spécial pour 24 h.",
    ],
    settings: [
      { field: "birthdayChannelId", desc: "Salon des annonces." },
      { field: "birthdayRoleId", desc: "Rôle attribué pendant 24 h le jour J." },
      { field: "birthdayMessage", desc: "Message d'annonce. Supporte {user}." },
    ],
  },
  {
    id: "levels",
    group: "Shard",
    title: "Niveaux & XP",
    tagline: "Progression XP, paliers, récompenses de rôles, multiplicateurs.",
    intro: [
      "Le système de niveaux le plus complet : chaque message rapporte de l'XP (entre xpMin et xpMax), avec un cooldown anti-grind. Les paliers sont totalement éditables — tu décides l'XP nécessaire pour chaque niveau.",
      "Tu peux récompenser certains niveaux par un rôle (ex : niveau 10 = rôle « Habitué ») et appliquer des multiplicateurs d'XP par rôle (ex : booster ×2).",
    ],
    settings: [
      { field: "levelsEnabled", type: "0 | 1", desc: "Active le système." },
      { field: "xpMin / xpMax", desc: "Plage d'XP gagnée par message (aléatoire entre les deux)." },
      { field: "xpCooldown", type: "5-600 s", desc: "Délai entre deux gains d'XP pour un même utilisateur." },
      { field: "levelUpChannelId / levelUpMessage / levelUpColor", desc: "Salon et apparence du message de level-up." },
      { field: "levelThresholds", desc: "Tableau JSON : XP requis pour chaque niveau. Plan gratuit limité à 3 paliers, Premium jusqu'à 20.", premium: true },
      { field: "levelRewards", desc: "Tableau {level, roleId} pour donner des rôles à certains niveaux." },
      { field: "xpRoleMultipliers", desc: "Multiplicateurs d'XP par rôle. Premium uniquement.", premium: true },
    ],
    notes: [
      { kind: "tip", title: "Cooldown raisonnable", body: "5 secondes empêche le farm sans pénaliser les conversations naturelles. Ne descends pas en dessous de 3 sauf usage compétitif." },
    ],
  },
  {
    id: "economy",
    group: "Shard",
    title: "Économie",
    tagline: "Monnaie virtuelle + récompenses quotidiennes + boutique de rôles.",
    intro: [
      "Système monétaire complet. Les membres reçoivent une récompense aléatoire chaque jour (entre min et max), gagnent un bonus en parrainant un nouveau membre, et peuvent dépenser leur monnaie dans une boutique de rôles que tu configures.",
    ],
    settings: [
      { field: "economyEnabled", type: "0 | 1", desc: "Active l'économie." },
      { field: "economyCurrencyName", desc: "Nom de la monnaie affiché partout (ex : « shards », « coins »)." },
      { field: "economyDailyMin / economyDailyMax", desc: "Plage de la récompense quotidienne." },
      { field: "referralReward", desc: "Bonus reçu en parrainant un nouveau membre. Premium uniquement.", premium: true },
      { field: "shopItems", desc: "Tableau des rôles vendables dans la boutique avec leurs prix." },
    ],
  },
  {
    id: "giveaways",
    group: "Shard",
    title: "Giveaways",
    tagline: "Concours avec durée, gagnants multiples, conditions de rôle/niveau.",
    intro: [
      "Lance un giveaway depuis le dashboard : tu choisis le salon, le prix, le nombre de gagnants, la durée et éventuellement des conditions (rôle minimum, niveau minimum). Les membres réagissent, le bot tire au sort à la fin.",
    ],
    settings: [
      { field: "channelId / prize / winnersCount / duration / durationUnit", desc: "Paramètres de base." },
      { field: "minRoleId", desc: "Rôle minimum pour participer (optionnel)." },
      { field: "minLevel", desc: "Niveau minimum pour participer (optionnel, nécessite le module Niveaux)." },
    ],
    notes: [
      { kind: "info", title: "Limite Free vs Premium", body: "Plan gratuit : 1 giveaway actif à la fois. Premium : jusqu'à 5 simultanés." },
    ],
  },
  {
    id: "polls",
    group: "Shard",
    title: "Sondages",
    tagline: "2 à 5 choix, durée variable, mode anonyme Premium.",
    intro: [
      "Crée des sondages avec 2 à 5 choix dans n'importe quel salon. Définis la durée (le bot clôture automatiquement) ou laisse-le ouvert indéfiniment et clos-le manuellement.",
      "Le mode anonyme cache l'identité des votants (Premium). En mode normal Discord, on peut voir qui a réagi.",
    ],
    notes: [
      { kind: "premium", title: "Anonyme = Premium", body: "Le mode sondage anonyme nécessite le Premium. Sans, les votes sont visibles via les réactions Discord." },
    ],
  },
  {
    id: "tempvoice",
    group: "Shard",
    title: "Vocaux temporaires",
    tagline: "Salon « hub » qui crée un vocal personnel pour chaque membre.",
    intro: [
      "Tu désignes un salon vocal « déclencheur ». Quand un membre le rejoint, Shard crée instantanément un nouveau salon vocal dans une catégorie cible, déplace le membre dedans, et lui donne le contrôle. Quand le dernier membre quitte, le salon est supprimé.",
      "Le nom du salon est généré à partir d'un template avec `{username}` (ex : « Salon de Alice »).",
    ],
    settings: [
      { field: "tempVoiceTrigger", desc: "Salon vocal « hub » à rejoindre pour déclencher la création." },
      { field: "tempVoiceCategory", desc: "Catégorie où sera créé le nouveau salon." },
      { field: "tempVoiceName", desc: "Template du nom. Variable : {username}." },
    ],
    notes: [
      { kind: "info", title: "Limite Free vs Premium", body: "Plan gratuit : 1 hub. Premium : jusqu'à 5 hubs simultanés." },
    ],
  },
  {
    id: "embed",
    group: "Shard",
    title: "Embed Builder",
    tagline: "Constructeur visuel d'embeds avec aperçu en direct.",
    intro: [
      "Outil pur de création d'embeds : tu remplis titre, description, pied, image, couleur et tu vois le rendu en temps réel. Quand tu es content, tu cliques « Envoyer » pour poster dans le salon choisi.",
      "C'est une commande ponctuelle — pas de configuration persistée. Pratique pour annoncer un événement ou écrire le règlement de manière propre.",
    ],
  },
  {
    id: "reactions",
    group: "Shard",
    title: "Réactions auto",
    tagline: "Quand un message contient X, le bot ajoute l'emoji Y.",
    intro: [
      "Liste de paires (texte → emoji). À chaque message, Shard cherche le texte dans le contenu (sensible à la casse) et ajoute l'emoji correspondant en réaction. Tu peux empiler les règles.",
      "Cas typiques : « gg » → 🎉, « goodnight » → 🌙, « lfg » → 🚀.",
    ],
  },
  {
    id: "tickets",
    group: "Shard",
    title: "Tickets de support",
    tagline: "Panel public, tickets privés, transcripts auto.",
    intro: [
      "Système de support complet. Tu publies un panneau public (embed avec un bouton) dans un salon. Les membres cliquent, Shard crée un salon privé visible uniquement par eux et ton rôle support. À la fermeture, un transcript est sauvegardé dans un salon de logs.",
    ],
    settings: [
      { field: "ticketEnabled", type: "0 | 1", desc: "Active les tickets." },
      { field: "ticketCategoryId", desc: "Catégorie où les salons-tickets sont créés." },
      { field: "ticketSupportRoleId", desc: "Rôle du staff ajouté à chaque ticket." },
      { field: "ticketLogChannelId", desc: "Salon où sont postés les transcripts." },
      { field: "ticketMaxPerUser", type: "1-10", desc: "Nombre max de tickets ouverts par utilisateur." },
      { field: "ticketPanelChannelId / Title / Description / Color", desc: "Paramètres du panneau public d'ouverture." },
    ],
    steps: [
      "Crée la catégorie « Tickets » et un rôle « Support ».",
      "Onglet Tickets → active, sélectionne catégorie + rôle support + salon de logs.",
      "Configure le panneau public (titre, description, couleur, salon de publication).",
      "Clique « Publier le panel ». L'embed apparaît dans le salon choisi avec un bouton « Ouvrir un ticket ».",
    ],
  },

  /* ───────── Compte & Premium ───────── */
  {
    id: "premium",
    group: "Compte & Premium",
    title: "Premium · à quoi ça sert",
    tagline: "Limites supérieures, modules avancés, support prioritaire.",
    intro: [
      "Le Premium déverrouille les options avancées des modules existants — il n'ajoute pas de bots ni de commandes complètement nouvelles. Tu paies pour repousser les limites du plan gratuit (mots interdits illimités, jusqu'à 20 paliers XP, multiplicateurs par rôle, mode sondage anonyme, parrainage, alertes Twitch/YouTube, panel de tickets…) et pour le support prioritaire.",
      "Une licence est liée à un serveur Discord, pas à un compte. Tu peux changer le serveur lié en contactant le support.",
      "Deux formules : abonnement mensuel sans engagement, ou achat à vie payé une fois pour toujours.",
    ],
    seeAlso: [
      { id: "faq", label: "FAQ — facturation, transferts, remboursement" },
    ],
  },

  /* ───────── Référence ───────── */
  {
    id: "variables",
    group: "Référence",
    title: "Variables des messages",
    tagline: "La liste complète des placeholders utilisables dans les textes.",
    intro: [
      "Toutes les variables ci-dessous sont remplacées au moment de l'envoi du message. Tu peux les utiliser dans les messages d'accueil, de départ, d'anniversaire, de level-up, et dans les annonces planifiées.",
    ],
    settings: [
      { field: "{user}", desc: "Mention cliquable du membre concerné (ex : @Alice)." },
      { field: "{username}", desc: "Pseudo affiché du membre (sans @)." },
      { field: "{server}", desc: "Nom du serveur Discord." },
      { field: "{memberCount}", desc: "Nombre total de membres au moment du message." },
      { field: "{level}", desc: "Disponible dans le message de level-up uniquement. Niveau atteint." },
    ],
  },
  {
    id: "permissions",
    group: "Référence",
    title: "Permissions Discord requises",
    tagline: "Ce que les bots demandent et pourquoi.",
    intro: [
      "Au moment de l'invitation, Discord te demande d'accepter un ensemble de permissions. Voici lesquelles sont nécessaires et pour quoi faire.",
    ],
    settings: [
      { field: "Gérer les rôles", desc: "Indispensable pour attribuer le rôle vérifié, le rôle quarantaine, l'auto-rôle, le rôle anniversaire, les récompenses XP." },
      { field: "Gérer les salons", desc: "Pour créer/supprimer les salons-tickets et les vocaux temporaires." },
      { field: "Modérer les membres (Timeout)", desc: "Pour appliquer les mutes (Discord timeouts)." },
      { field: "Expulser / Bannir", desc: "Pour les sanctions automatiques warn-kick et warn-ban." },
      { field: "Gérer les messages", desc: "Pour supprimer les messages bannis (anti-spam, mots interdits, anti-liens)." },
      { field: "Voir l'historique des messages / Lire les messages", desc: "Pour analyser les messages dans le contexte des modules anti-spam et auto-réactions." },
      { field: "Envoyer des messages / Embed Links", desc: "Pour envoyer les messages d'accueil, level-up, sondages, embeds." },
    ],
    notes: [
      { kind: "tip", title: "Le plus simple : Administrateur", body: "Cocher « Administrateur » à l'invitation couvre tout en une fois et évite les bugs de permission. C'est ce qu'on recommande." },
    ],
  },
  {
    id: "faq",
    group: "Référence",
    title: "FAQ",
    tagline: "Les questions qu'on nous pose le plus.",
    intro: [
      "Si tu ne trouves pas ta réponse ici, ouvre un ticket sur notre serveur de support.",
    ],
    settings: [
      { field: "Mes données sont-elles en sécurité ?", desc: "Oui. Hébergement en Europe, transmissions TLS, aucun mot de passe stocké en clair. Conforme RGPD." },
      { field: "Puis-je transférer ma licence Premium sur un autre serveur ?", desc: "Oui, en contactant le support. Le transfert est gratuit mais ponctuel (pas de revente)." },
      { field: "Le bot est offline, que faire ?", desc: "Consulte la page Statut. Si l'incident persiste après le retour à la normale, ouvre un ticket avec ton ID de serveur." },
      { field: "Comment annuler l'abonnement mensuel ?", desc: "Page Premium → bouton « Gérer mon abonnement » qui t'amène vers le portail Stripe. Annulation effective à la fin de la période en cours." },
      { field: "L'achat à vie expire-t-il ?", desc: "Non. Une fois payé, le serveur garde le Premium tant que les bots existent." },
      { field: "Puis-je tester avant d'acheter ?", desc: "Oui : tout ce qui n'est pas marqué Premium dans le wiki est gratuit et illimité dans le temps." },
    ],
  },
];

const GROUPS: Section["group"][] = [
  "Démarrage",
  "ShardGuard",
  "Shard",
  "Compte & Premium",
  "Référence",
];

/* ───────────── Component ───────────── */

export function Wiki() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  const filtered = useMemo(() => {
    if (!query.trim()) return SECTIONS;
    const q = query.toLowerCase();
    return SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.tagline.toLowerCase().includes(q) ||
      s.intro.some(p => p.toLowerCase().includes(q)) ||
      s.settings?.some(set => set.field.toLowerCase().includes(q) || set.desc.toLowerCase().includes(q))
    );
  }, [query]);

  const groupedFiltered = useMemo(() => {
    const out: Record<string, Section[]> = {};
    for (const g of GROUPS) out[g] = filtered.filter(s => s.group === g);
    return out;
  }, [filtered]);

  // Track active section in viewport via IntersectionObserver
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32 overflow-hidden">
        {/* Hero — same editorial home pattern */}
        <header className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
          <motion.p
            className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
          >
            Documentation
          </motion.p>
          <motion.h1
            className="font-extrabold leading-[0.9] tracking-tight uppercase mb-10"
            style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
            initial={{
              opacity: 0,
              x: reduce ? 0 : -120,
              filter: reduce ? "blur(0px)" : "blur(8px)",
            }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
          >
            WIKI
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, x: reduce ? 0 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
          >
            La doc complète de <span className="text-white">ShardGuard et Shard</span> —
            guides, paramètres, pièges à éviter pour configurer chaque module
            proprement.
          </motion.p>

          {/* Search */}
          <motion.div
            className="relative mt-12 max-w-lg mx-auto"
            initial={{ opacity: 0, y: reduce ? 0 : 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65, ease: heroEase }}
          >
            <Search className="w-4 h-4 absolute left-5 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un module, un paramètre, une question…"
              className="w-full pl-12 pr-12 py-3.5 bg-white/[0.025] border border-white/10 rounded-full text-[14px] placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60"
                aria-label="Effacer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>

          {/* Samia (AI assistant) CTA — same neutral DA as the rest of the site */}
          <Link
            to="/assistant"
            className="group inline-flex items-center gap-2.5 mt-6 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/25 text-white/80 hover:text-white transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-white/60" />
            <span className="text-[13px] font-medium">
              Pas envie de chercher ? Demande à Samia, l'assistante IA
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </Link>
        </header>

        {/* Hairline divider before the docs */}
        <div className="h-px w-full bg-white/[0.06] mb-14" />

        <div className="grid md:grid-cols-[220px_1fr] lg:grid-cols-[240px_minmax(0,720px)_1fr] gap-12 lg:gap-16">
          {/* Sidebar */}
          <aside className="md:sticky md:top-28 md:self-start md:max-h-[calc(100vh-8rem)] md:overflow-y-auto md:pr-2 lg:col-start-1">
            <nav className="space-y-8">
              {GROUPS.map(g => {
                const items = groupedFiltered[g];
                if (!items?.length) return null;
                return (
                  <div key={g}>
                    <p className="text-[10.5px] font-medium uppercase tracking-[0.24em] text-white/30 mb-3">
                      {g}
                    </p>
                    <ul className="space-y-px border-l border-white/[0.06]">
                      {items.map(s => {
                        const active = activeId === s.id;
                        return (
                          <li key={s.id}>
                            <a
                              href={`#${s.id}`}
                              onClick={() => setActiveId(s.id)}
                              className={`relative block -ml-px pl-4 pr-2 py-1.5 text-[13px] leading-snug transition-colors border-l ${
                                active
                                  ? "text-white border-white/70 font-medium"
                                  : "text-white/45 border-transparent hover:text-white/85"
                              }`}
                            >
                              {s.title}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {!filtered.length && (
                <p className="text-sm text-white/35 italic">Aucun résultat pour « {query} ».</p>
              )}
            </nav>
          </aside>

          {/* Content — narrow editorial column */}
          <div className="space-y-20 min-w-0 lg:col-start-2">
            {filtered.map(s => (
              <SectionView key={s.id} section={s} />
            ))}
            {!filtered.length && (
              <div className="border-t border-b border-white/[0.06] py-16 text-center">
                <p className="text-white/55">Aucune section ne correspond à <span className="text-white">« {query} »</span>.</p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-white/70 hover:text-white border-b border-white/30 hover:border-white pb-0.5"
                >
                  Voir tout le wiki <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right rail — empty for now, reserves rhythm on lg+ */}
          <div className="hidden lg:block" />
        </div>
      </section>
    </AppLayout>
  );
}

/* ───────────── Section view ───────────── */

function SectionView({ section: s }: { section: Section }) {
  const isReference = s.id === "variables" || s.id === "permissions" || s.id === "faq";
  return (
    <article id={s.id} className="scroll-mt-32">
      {/* Header */}
      <header className="mb-8">
        <p className="text-[10.5px] font-medium tracking-[0.28em] uppercase text-white/30 mb-3">
          {s.group}
        </p>
        <a
          href={`#${s.id}`}
          className="group inline-flex items-baseline gap-2 hover:text-white transition-colors"
        >
          <h2 className="text-3xl md:text-[36px] font-extrabold tracking-[-0.02em] leading-[1.1]">
            {s.title}
          </h2>
          <Hash className="w-4 h-4 text-white/15 group-hover:text-white/40 transition-colors translate-y-1" />
        </a>
        <p className="text-white/50 text-[15px] mt-3 leading-relaxed">{s.tagline}</p>
      </header>

      {/* Intro */}
      <div className="space-y-4 text-white/72 leading-[1.75] text-[15.5px] mb-10">
        {s.intro.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      {/* Settings — borderless table */}
      {s.settings && s.settings.length > 0 && (
        <div className="mb-10">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/35 mb-4">
            {isReference ? "Liste" : "Paramètres"}
          </h3>
          <dl className="divide-y divide-white/[0.06] border-t border-b border-white/[0.06]">
            {s.settings.map(set => (
              <div key={set.field} className="grid md:grid-cols-[240px_1fr] gap-2 md:gap-8 py-3.5">
                <dt className="flex items-start gap-2 min-w-0">
                  <code className="text-[12.5px] text-white/85 font-mono bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 break-words">
                    {set.field}
                  </code>
                  {set.premium && (
                    <span className="flex-shrink-0 text-[9.5px] font-medium uppercase tracking-[0.18em] text-amber-300/85 mt-1">
                      Premium
                    </span>
                  )}
                </dt>
                <dd className="min-w-0">
                  {set.type && <span className="text-[11.5px] text-white/35 font-mono mr-2">{set.type}</span>}
                  <span className="text-[14px] text-white/68 leading-[1.65]">{set.desc}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Steps — refined numbered list */}
      {s.steps && s.steps.length > 0 && (
        <div className="mb-10">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/35 mb-4">
            Mise en place
          </h3>
          <ol className="space-y-3">
            {s.steps.map((step, i) => (
              <li key={i} className="flex items-baseline gap-4">
                <span className="flex-shrink-0 w-5 text-right text-[12px] font-mono text-white/30 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[14.5px] text-white/72 leading-[1.7]">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Notes */}
      {s.notes && s.notes.length > 0 && (
        <div className="space-y-3 mb-2">
          {s.notes.map((n, i) => {
            const type = n.kind === "premium" ? "warning" : n.kind;
            const title = n.title || (n.kind === "premium" ? "Premium" : undefined);
            return (
              <Admonition key={i} type={type} title={title} animate={false}>
                {n.body}
              </Admonition>
            );
          })}
        </div>
      )}

      {/* See also */}
      {s.seeAlso && s.seeAlso.length > 0 && (
        <p className="text-[13px] text-white/45 mt-8 pt-6 border-t border-white/[0.06]">
          <span className="text-white/30 mr-2">Voir aussi —</span>
          {s.seeAlso.map((sa, i) => (
            <span key={sa.id}>
              {i > 0 && <span className="text-white/20 mx-2">·</span>}
              <a href={`#${sa.id}`} className="text-white/75 hover:text-white border-b border-white/15 hover:border-white/60 pb-0.5">
                {sa.label}
              </a>
            </span>
          ))}
        </p>
      )}
    </article>
  );
}

export default Wiki;
