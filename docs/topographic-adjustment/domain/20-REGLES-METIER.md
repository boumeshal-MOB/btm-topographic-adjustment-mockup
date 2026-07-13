# Règles métier et invariants

Les identifiants de règle sont stables afin de pouvoir les citer dans le code, les tests, les
messages de validation et les tickets.

## A. Processing et périmètre

- **PROC-001** — Le type BTM est `Topographic Adjustment` et ne réutilise pas `Theodolite`.
- **PROC-002** — Un processing appartient au projet BTM courant.
- **PROC-003** — Un processing est `single-station` ou `network`.
- **PROC-004** — Un processing réseau contient un seul réseau topographique connecté.
- **PROC-005** — Des stations indépendantes ou géographiquement sans relation sont séparées en
  plusieurs processings.
- **PROC-006** — Le moteur de production est exclusivement STAR*NET Ultimate.
- **PROC-007** — Aucun paramètre d'un autre moteur n'est stocké dans l'Adjustment Template produit.

## B. Données BTM

- **DATA-001** — Les observations Hz/Vz/Sd sont lues dans `raw_data` via des variables BTM
  explicitement mappées.
- **DATA-002** — Les variables Hz/Vz/Sd appartiennent au capteur/prisme BTM selon le modèle réel.
- **DATA-003** — Le rôle d'une variable n'est jamais déduit uniquement depuis son nom.
- **DATA-004** — Température et pression sont sélectionnées explicitement ; leur parent BTM peut
  être une station, un capteur environnemental ou un autre objet valide.
- **DATA-005** — Toute requête TimescaleDB est bornée par une plage temporelle.
- **DATA-006** — Le parcours produit ne permet pas d'importer un fichier de mesures brutes.
- **DATA-007** — Une observation brute n'est jamais supprimée ou modifiée par Auto Adjust.
- **DATA-008** — Une cible non observée dans une époque n'est pas ajoutée artificiellement au calcul.

## C. Temps, époques et slots

- **TIME-001** — `Observation epoch` est le timestamp réel de la donnée source.
- **TIME-002** — `Output slot` est un timestamp de publication distinct, aligné sur une grille.
- **TIME-003** — Un timestamp source n'est jamais arrondi ni remplacé par le slot.
- **TIME-004** — Pour un intervalle de 30 minutes, les sorties sont à `:00/:30`.
- **TIME-005** — La fenêtre d'initialisation décrit les observations utilisées, pas la validité.
- **TIME-006** — La validité d'une configuration est `[validFrom, validTo[`.
- **TIME-007** — Un recalcul choisit par défaut la version valide pour chaque slot.
- **TIME-008** — Un catch-up utilise la version historiquement valide au slot, pas forcément la
  version active au jour du catch-up.

## D. Station et configuration de mesure

- **MEAS-001** — Le modèle et la hauteur instrument sont des propriétés de station dans la version.
- **MEAS-002** — Le mode EDM n'est pas un paramètre global obligatoire de la station.
- **MEAS-003** — Type de mesure, EDM, réflecteur, constante, hauteur cible et poids sont résolus par
  observation ou par `station × cible`.
- **MEAS-004** — Priorité : métadonnée observation → mapping versionné → override de version →
  template → fallback station autorisé → blocage/warning.
- **MEAS-005** — Tout fallback utilisé est visible et snapshotté.
- **MEAS-006** — Prism exige un reflector template.
- **MEAS-007** — Reflective sheet possède son propre setup et n'est pas assimilée à un prisme 0 mm.
- **MEAS-008** — Reflectorless n'a ni prisme ni constante et utilise les poids non-prism.
- **MEAS-009** — Un même instrument peut mélanger les trois familles dans le même cycle.
- **MEAS-010** — Une précision mm+ppm attachée à un setup est prioritaire sur le poids de fallback
  du projet STAR*NET.

## E. Corrections de distance

- **CORR-001** — `Sd` est une distance inclinée.
- **CORR-002** — `prismDelta = requiredConstant − alreadyAppliedConstant`.
- **CORR-003** — La correction de prisme s'applique à la distance inclinée.
- **CORR-004** — La correction atmosphérique EDM s'applique après la correction de réflecteur.
- **CORR-005** — Une correction déclarée déjà appliquée n'est jamais appliquée une seconde fois.
- **CORR-006** — La valeur corrigée, le delta et la source sont traçables par observation.
- **CORR-007** — `.SCALE` STAR*NET est un facteur horizontal de datum/grille, pas une correction
  atmosphérique complète de la mesure EDM.
- **CORR-008** — Le coefficient de réfraction STAR*NET corrige la géométrie zénithale et reste
  distinct de la correction T/P de distance.
- **CORR-009** — Une mesure Reflectorless a toujours `prismDelta = 0`.
- **CORR-010** — La formule atmosphérique possède un ID/version et est affichable.

## F. Données atmosphériques

- **ATMO-001** — Modes : déjà corrigée, T/P du cycle, T/P fixes, aucune correction.
- **ATMO-002** — Le comportement T/P absentes/invalides est une politique distincte.
- **ATMO-003** — La recherche T/P respecte une tolérance temporelle versionnée.
- **ATMO-004** — Les plages de validité T/P sont contrôlées avant calcul.
- **ATMO-005** — Une donnée tardive peut déclencher un catch-up si la politique le prévoit.
- **ATMO-006** — L'utilisation d'un fallback peut rendre le résultat provisoire.

## G. Identité des points

- **POINT-001** — Chaque cible/prisme BTM possède une identité distincte par défaut.
- **POINT-002** — Un nom identique n'est jamais une preuve de point physique commun.
- **POINT-003** — `AdjustmentName` n'est réutilisé comme nom moteur que s'il est valide, unique et
  associé au point physique confirmé.
- **POINT-004** — Le mapping PhysicalPoint ↔ cible BTM est versionné.
- **POINT-005** — Un point physique partagé possède une seule inconnue E/N/H dans le calcul.
- **POINT-006** — Les résidus restent attachés à la station, cible BTM et observation source.
- **POINT-007** — Un mapping antérieur peut être réutilisé uniquement parce qu'il a été confirmé,
  jamais parce que les noms se ressemblent.
- **POINT-008** — Un seul point commun ne détermine pas l'orientation relative si elle est inconnue.
- **POINT-009** — Deux points séparés horizontalement sont le minimum mathématique usuel ; le
  statut est `Weak geometry` faute de redondance.
- **POINT-010** — Trois points bien distribués sont recommandés pour une validation robuste.
- **POINT-011** — Les candidats géométriques sont soumis à validation humaine.
- **POINT-012** — Les cibles individuelles ne polluent pas le tableau des points partagés.
- **POINT-013** — Une relation géométrique ne fusionne jamais ses deux endpoints.
- **POINT-014** — Une distance seule ne suffit pas à relier complètement translation et rotation
  de deux composantes libres.
- **POINT-015** — Les noms moteur sont uniques dans un processing/run, pas globalement entre projets.

## H. Nomenclature STAR*NET

- **NAME-001** — Le nom source BTM est conservé sans modification.
- **NAME-002** — `physicalPointId` est opaque, stable et non envoyé comme nom dans le `.dat`.
- **NAME-003** — `engineName` est versionné et sert dans `.dat` et sorties natives.
- **NAME-004** — Les noms moteur respectent au plus 15 caractères et de préférence
  `[A-Za-z0-9_]`.
- **NAME-005** — Le tiret, espace, virgule, `=`, `#` et guillemets sont interdits par la règle BTM.
- **NAME-006** — Une collision génère un alias neutre déterministe `PT000001`/`ST0001`.
- **NAME-007** — `MPO` est réservé aux données/noms France et n'est jamais généré pour UK.
- **NAME-008** — Le mapping inverse `engineName → physicalPoint → cibles BTM` est complet.

## I. Coordonnées initiales et références

- **INIT-001** — Un nouveau processing sélectionne par défaut le mode station ancre locale.
- **INIT-002** — `0/0/0/0` est autorisé pour station E/N/H/orientation en repère local.
- **INIT-003** — Des coordonnées connues ne sont affichées que si elles existent réellement dans
  BTM ou sont fournies explicitement.
- **INIT-004** — Les références acceptent fixed, weak sigma ou free par composante.
- **INIT-005** — L'observation représentative est la médiane de Hz, Vz et Sd corrigée sur la fenêtre.
- **INIT-006** — Le calcul affiche la disponibilité points/couples et les absents.
- **INIT-007** — Les estimations multi-stations sont combinées avec une dispersion affichée.
- **INIT-008** — Les coordonnées initiales appartiennent au snapshot de la version.
- **INIT-009** — L'action s'appelle `Use as initial coordinates`, pas `Fix coordinates`.
- **INIT-010** — Le contrôle de rang reste obligatoire après l'initialisation.

## J. Ajustement et qualité

- **ADJ-001** — La production génère uniquement des paramètres supportés par STAR*NET.
- **ADJ-002** — La convergence STAR*NET est sans unité et distincte du seuil du solveur de démo.
- **ADJ-003** — Solution iterations et Auto Adjust iterations sont deux paramètres différents.
- **ADJ-004** — Le χ² est bilatéral selon le niveau de signification configuré.
- **ADJ-005** — La propagation des erreurs est nécessaire pour sigmas et ellipses.
- **ADJ-006** — Un run non convergé ou déficient en rang n'est pas publié comme succès.
- **ADJ-007** — Auto Adjust retire des observations du trial, dans des limites configurées.
- **ADJ-008** — Chaque exclusion conserve la raison et le résidu standardisé.
- **ADJ-009** — Une réussite obtenue en gonflant excessivement les sigmas produit un warning.
- **ADJ-010** — Les points mono-rayon/non redondants sont identifiés comme tels.

## K. Run et synchronisation

- **RUN-001** — Déclenchement event-driven par défaut, schedule ou manuel.
- **RUN-002** — Un réseau event-driven attend une donnée exploitable de chaque station requise.
- **RUN-003** — Une époque dans la tolérance est `fresh`.
- **RUN-004** — Une ancienne époque dans l'âge maximal est `reused`.
- **RUN-005** — Une réutilisation est visible et peut rendre le résultat provisoire.
- **RUN-006** — Une station requise sans donnée exploitable bloque le run.
- **RUN-007** — Une station optionnelle manquante suit la politique configurée.
- **RUN-008** — Le catch-up est idempotent et limité en nombre/taille de fenêtre.
- **RUN-009** — Un run est isolé par processing/run et ne partage pas ses noms/fichiers.
- **RUN-010** — Si la licence impose la sérialisation, l'appel STAR*NET utilise un lock explicite.

## L. Sorties

- **OUT-001** — Les variables de sortie appartiennent au processing.
- **OUT-002** — Une variable est créée une seule fois par cible/composant, indépendamment des versions.
- **OUT-003** — X/Y/Z, Delta X/Y/Z et Sigma X/Y/Z sont disponibles par cible publiée.
- **OUT-004** — Delta utilise les coordonnées initiales de la version appliquée au slot.
- **OUT-005** — Chi2 Passed, Variance Factor, References Available et Target Availability sont
  des variables globales du processing.
- **OUT-006** — Target Availability = cibles de sortie actives observées / total actif × 100.
- **OUT-007** — Une cible non ajustée n'obtient pas de coordonnée inventée.
- **OUT-008** — Un point partagé peut diffuser sa coordonnée aux cibles BTM liées actives.
- **OUT-009** — Un recalcul UPSERT la même clé `(variable_id, timestamp)`.
- **OUT-010** — Un recalcul ne crée ni nouvelle variable ni valeur concurrente dans `measures`.

## M. Versions, fichiers et audit

- **VER-001** — Une version utilisée est immuable.
- **VER-002** — Une modification crée un draft/nouvelle version avec raison.
- **VER-003** — Une version historique peut être archivée mais pas supprimée si utilisée.
- **VER-004** — Un template modifié ne change pas une configuration existante.
- **VER-005** — Les fichiers STAR*NET sont générés à chaque run.
- **VER-006** — Les fichiers sont temporaires et ne sont pas la source de vérité.
- **VER-007** — Le dossier est supprimé seulement après ingestion réussie.
- **VER-008** — Le run journalise au minimum config, slot, trigger, statut, sources/fallbacks et QC.
- **VER-009** — Les coordonnées de sortie ne sont pas dupliquées dans l'historique des runs.
- **VER-010** — Toute activation, archive, mapping, recalcul forcé et changement de template est audité.

## N. Maquette

- **DEMO-001** — Le classeur ATS34 est converti en fixture de build, pas lu par l'utilisateur.
- **DEMO-002** — La fixture UK est mono-station et ne prouve aucun point commun multi-stations.
- **DEMO-003** — Les scénarios réseau supplémentaires sont explicitement synthétiques.
- **DEMO-004** — Le solveur navigateur est étiqueté démonstration/non certifié.
- **DEMO-005** — Aucune règle de production ne dépend d'IndexedDB, de MSW ou du Web Worker.

