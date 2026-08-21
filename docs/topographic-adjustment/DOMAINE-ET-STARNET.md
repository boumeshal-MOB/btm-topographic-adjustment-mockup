# Domaine, architecture, règles et STAR*NET

Les contrats et règles permanents, puis la génération et l'exécution natives. Ce que le produit doit
permettre est dans [`PRODUIT-ET-PARCOURS.md`](PRODUIT-ET-PARCOURS.md) ; ce qui est vérifié et ce qui
reste ouvert dans [`VALIDATION.md`](VALIDATION.md).

## Hiérarchie d'autorité

1. décisions confirmées dans ce dossier ;
2. contrats et tests exécutables du dépôt ;
3. fichiers STAR*NET/BTM fournis et documentation éditeur ;
4. comportement du legacy comme source d'inspiration, jamais comme vérité automatique ;
5. anciennes maquettes uniquement pour comprendre une intention.

Une valeur inconnue reste marquée à valider. Ne pas copier un paramètre UK vers la France ni inventer
un mapping de point pour rendre une démo verte.

## Architecture cible

### Maquette

- React/MUI/Vite sur Vercel ;
- MSW et repositories de démonstration remplaçables ;
- noyau TypeScript pur pour l'interactivité ;
- noyau Python 3.12 canonique pour les calculs et tests scientifiques ;
- passerelle HTTPS temporaire vers le service Windows pour les essais STAR*NET réels ;
- données synthétiques commitées, clairement étiquetées ; aucune saisie de secret persistée.

### BTM réel

- nouveau `processing_type = Topographic Adjustment` ;
- observations Hz/Vz/Sd dans `raw_data`, chaque variable appartenant à un capteur/prisme ;
- mapping explicite et versionné des variables d'entrée ;
- configuration et historique en base BTM ;
- variables de sortie appartenant au processing, stables entre versions ;
- API BTM et file de jobs persistante/idempotente ;
- préparation/initialisation possibles dans une Lambda Python stateless ;
- STAR*NET Ultimate exécuté uniquement sur la VM Windows dédiée ;
- dossier éphémère isolé par `processingId/runId`, aucun fichier serveur comme source de vérité ;
- parse des sorties natives puis transaction base ; suppression du dossier seulement après
  persistance réussie.

Ni S3, ni FTP, ni Lambda ne sont nécessaires pour faire tourner STAR*NET lui-même. L'interface réseau
définitive entre BTM et la VM reste un choix d'infrastructure ; le pilote HTTPS actuel ne doit pas
devenir une architecture de production par accident.

## Frontières de code

- `src/domain` : fonctions/types purs, sans React, MSW, IndexedDB ou filesystem ;
- `src/repositories` : ports vers données, moteur et publication — des interfaces sans
  implémentation, volontairement : c'est le seam que la reprise BTM remplace ;
- `src/demo` et `src/mocks` : adaptateurs de démonstration remplaçables ;
- `src/features` : présentation et orchestration, aucune formule scientifique cachée ;
- `packages/python/topographic-adjustment-core` : référence mathématique testable ;
- `packages/lambdas/topographic-adjustment` : adaptateur stateless, pas source du domaine ;
- `src/domain/starnet` : génération/parsing déterministes et transport vers le service ;
- `server/starnet14-service` : isolation, sécurité, exécution et collecte natives.

Les composants réutilisables doivent rester compatibles avec le runtime React 17 de BTM. Les entrées
externes et presets sont validés par schéma. Les unités figurent dans les types, labels, tables et
previews.

## Modèle logique minimal

### Processing et configuration

`TopographicAdjustmentProcessing` possède une portée `single-station|network`, un statut, un flag
enabled et une version active. `AdjustmentConfigVersion` est un snapshot complet contenant :

- stations et instruments, avec leur précision de mesure ;
- target bindings, variables Hz/Vz/Sd et configurations de mesure ;
- points physiques et relations géométriques ;
- références, coordonnées initiales et provenance ;
- paramètres STAR*NET/poids/Auto Adjust ;
- politique Run/synchronisation/catch-up ;
- politique Output ;
- template ID/version, overrides, auteur, raison et intervalle de validité.

États de version : draft, active, archived. Intervalles semi-ouverts `[from,to[`, sans chevauchement
actif. Une version utilisée est immuable et reste résoluble historiquement.

### Entrées

Une `ObservationVariableBinding` relie un `prismSensorId` à Hz, Vz, Sd et métadonnées éventuelles. Une
`TargetBinding` relie station, prisme, nom brut, rôle, configuration de mesure, point physique et nom
moteur. `stationCode` brut et `stationId` BTM sont reliés explicitement et uniques dans une
configuration ; un doublon est une erreur.

### Sorties

Le mapping stable relie processing, point physique, prisme BTM, composante et `variable_id`. Plusieurs
prismes qui représentent un point commun gardent leurs sorties propres si le produit le demande ; le
résultat STAR*NET revient d'abord par `engineName`, puis passe par le snapshot de mapping exact du
run. Aucun rapprochement par label au moment du parsing.

### Run

Le run minimal conserve processing, version, slot, trigger, observations sources, statut
fresh/reused/missing, début/fin, diagnostics χ²/variance/rang, tentatives Auto Adjust, erreur et
provenance du moteur. Les coordonnées finales vivent dans `measures` ; leur duplication dans chaque run
n'est pas requise.

## Règles métier stables

### Processing et données

- **PROC** — un processing = une station ou un réseau connecté ; groupes indépendants séparés.
- **DATA** — pas d'upload brut ; mapping de variable explicite, schématisé et versionné ; aucune
  inférence de rôle depuis un nom seul.
- **TIME** — époque source, fenêtre d'initialisation, slot de sortie et validité de config sont
  distincts ; calcul interne et stockage en UTC.

### Mesures et corrections

- **MEAS** — réflecteur, constantes et hauteur résolus par station–cible ; mélanges permis.
- **PREC** — la précision se résout par une chaîne unique, `template pays → instrument de la station →
  cette visée`, et chaque valeur porte l'étape qui l'a énoncée. Un écart-type de distance appartient à
  l'EDM et à son réflecteur, un écart-type angulaire à l'instrument ; aucun des deux n'est une
  propriété du projet. `adjustment.defaultWeights` reste le défaut écrit dans le `.prj`, pas ce qui
  pèse une observation.
- **CORR** — appliquer les corrections une fois, dans un ordre tracé ; réflecteur sans constante
  résolue = décision requise ; reflectorless = delta zéro ; `.SCALE` réservé datum/grille.
- **ATMO** — modes déjà appliqué, cycle T/P, T/P fixe ou none ; formule/version/provenance ;
  invalidité et fallback explicites. Une lecture T/P sert une observation si elle est à moins de
  `temporalToleranceMinutes` de **cette observation**, pas du créneau de publication : ce sont deux
  horloges différentes. Le rattrapage n'est pas une décision de la politique atmosphérique — il
  appartient au run, où il est borné et vérifié (`CatchUpPolicy`).

Formule de référence actuelle, remplaçable après validation métier :

```text
ppm = 281.8 − 0.29065 × P_hPa / (1 + T_C / 273.15)
scale = 1 + ppm × 10⁻⁶
correctedSlope = (storedSlope + prismDelta) × scale
```

### Géométrie et identité

- **POINT** — individuel par défaut ; shared uniquement après confirmation ou reprise d'une version ;
  candidats géométriques tolérés mais jamais auto-validés ; homonymes séparés.
- **NAME** — `engineName` ASCII, déterministe, unique par job et mappé dans le snapshot ; les noms BTM
  visibles restent inchangés.
- **INIT** — coordonnées fournies ou station fixe XYZ+orientation ; agrégation robuste sur une
  période ; couverture affichée ; pas de coordonnée connue inventée ; rang/connectivité bloquants.
- **DATUM** — un enregistrement de coordonnée couvre n'importe quel point moteur, stations incluses
  (`station:<code>`), et n'existe que pour un point tenu : libérer un point, c'est supprimer sa ligne.
  Une station n'est jamais fixe. Le référentiel se décide sur les prismes, à l'étape Cibles, et au
  moins deux références **connues** et contraintes sont exigées, sinon rien n'est publié.

Conventions scientifiques : E/N/H en mètres ; azimut depuis le Nord dans le sens horaire ; Vz angle
zénithal ; Sd distance inclinée ; `hd = Sd sin(Vz)` ; `dh = Sd cos(Vz)` ; Face II normalisée par
Hz±180° et `Vz=360°−Vz`, puis moyenne circulaire. Une distance horizontale n'est jamais injectée
silencieusement comme Sd : elle est convertie à l'entrée par `Sd = Hd / sin(Vz)`, tracée, et refusée à
moins de ~3° de la verticale.

### Ajustement et sorties

- **ADJ** — moindres carrés pondérés, convergence/rang/dof/χ²/variance/résidus/sigmas/ellipses ; Auto
  Adjust traçable ; preview non certifiée clairement signalée.
- **RUN** — event-driven ou périodique ; synchronisation et réutilisation bornées ; état provisoire ;
  catch-up borné/idempotent. Les trois champs de `CatchUpPolicy` sont appliqués : `enabled` autorise
  le mécanisme, `windowHours` borne le **retard de la donnée** (l'écart entre la dernière observation
  disponible et le créneau, jamais l'âge de l'horloge murale : celui-ci ferait dépendre la réponse du
  moment où l'on ouvre l'écran) et `maxRecalculationsPerSlot` borne les réécritures d'un même
  créneau. Chaque refus nomme la limite et la valeur mesurée.
- **OUT** — slots UTC ; variables stables ; UPSERT par variable+timestamp ; `not-applicable` supprime
  l'ancien booléen χ² au lieu de le laisser stale.
- **VER** — snapshot complet, version utilisée immuable, résolution historique par slot ; aucun fichier
  éphémère comme historique.

## Paramètres de templates

Un template préremplit un draft ; il ne constitue pas une norme nationale et ne modifie jamais une
version existante. Ordre de résolution : métadonnée d'observation, mapping versionné, override,
template, fallback autorisé, warning/blocage.

### UK — projet fourni HS2/NTE

| Paramètre | Valeur initiale |
|---|---:|
| Dimension / unités / ordre | 3D / metres / EN |
| Angles / entrée 3D | DMS / Slope-Zenith |
| Local-grid / scale | Local / 1.0 |
| Réfraction / rayon Terre | 0.07 / 6 372 000 m |
| Convergence / itérations | 0.01 (unité STAR*NET) / 10 |
| χ² / ellipse | 5 % / 95 % |
| Distance | 1.0 mm + 1.0 ppm |
| Angle / direction / azimut / zénith | 1.414 / 2.5 / 1.0 / 1.5 arcsec |
| Centrages instrument / cible / vertical | 0.8 / 0.8 / 0.5 mm |
| Auto Adjust | max &#124;v&#124;/σ 3.0, 1 retrait/itération, 20 itérations |

Instrument proposé Leica TM50 I. Ce template **ne déclare volontairement aucune précision par famille
de réflecteur** : c'est un projet livré, ses nombres sont ceux du `.prj` fourni, et inventer une fiche
constructeur contredirait silencieusement le projet. Les poids du preset sont donc le plancher de la
chaîne de précision.

Les Sd fournies ont été enregistrées avec constante terrain 0 mm : circulaire +0.0 mm, L-bar +8.9 mm,
micro-prisme +26.5 mm, 360 mini +30.0 mm. La correction est un setup par cible.

### France — monitoring STAR*NET

| Paramètre | Valeur initiale |
|---|---:|
| Dimension / unités / ordre | 3D / metres / EN |
| Angles / entrée 3D | gons / Slope-Zenith |
| Local-grid / scale | Local / 1.0 |
| Réfraction / rayon Terre | 0.13 / 6 371 000 m |
| Convergence / itérations | 0.01 / 30 |
| χ² / ellipse | 5 % / 95 % |

Instrument proposé Topcon MS AX, avec valeurs nominales constructeur et validation projet requise. Ce
template déclare une précision angulaire (0.5″) et une précision de distance **par famille de
réflecteur** — prisme 0.8 mm, plaquette 0.5 mm, sans réflecteur 1.0 mm — que la chaîne de précision
lit directement.

Par défaut les distances France et l'atmosphère sont déjà corrigées. MPO FR : constante requise
+25.5 mm et déjà appliquée +25.5 mm, donc delta BTM 0. `MPO` est une nomenclature de la base France,
pas une identité physique universelle. Les poids/centrages FR de production ne doivent pas être
inventés.

## Génération native

Le `.dat` est une image du snapshot résolu : contraintes de contrôle effectives, coordonnées d'essai et
visées retenues. Il est construit depuis les noms moteur et les valeurs déjà résolues, et n'invente
jamais une coordonnée de référence. Une paire impossible à générer n'est pas émise à moitié : une
erreur de preview bloque l'exécution native avec la vraie cause.

Une station locale peut être fixée XYZ et orientation 0. Lorsque STAR*NET a besoin d'une direction, le
générateur ajoute un point d'orientation interne déterministe, clairement identifié, mappé et exclu des
sorties métier — et seulement si le réseau n'a aucun autre contrôle.

Le `.prj` doit partir du template natif fourni et déjà accepté par STAR*NET 14. Le générateur remplace
seulement les valeurs autorisées, garde des lignes courtes, l'encodage/CRLF attendu et évite de
reconstruire un fichier d'options à partir de suppositions. `.SCALE` est un facteur datum/grille, pas
une correction T/P.

Un fichier natif lit les distances selon un **unique mode de projet** : il ne peut pas mélanger
inclinée et horizontale. La conversion se fait donc à l'entrée, pas par une directive native.

Les transformations prisme/atmosphère peuvent être appliquées en amont à Sd si le `.dat` trace des
distances corrigées ; dans ce cas aucune directive native ne doit les appliquer une seconde fois.
Inversement, si un template natif porte une correction, le snapshot l'indique et le prétraitement
s'abstient. Les tests golden vérifient la chaîne.

Appel CLI standard : `StarNet.exe <project.prj> /RUN`. Les fichiers `.dat/.prj/.snproj` sont régénérés
par run dans un dossier isolé.

## Service Windows — pilote

La maquette peut envoyer un snapshot d'ajustement à une VM Windows où STAR*NET 14 Ultimate est
installé, récupérer les fichiers natifs et présenter le résultat dans le même contrat que le preview
scientifique. Le service ne remplace ni BTM ni un ordonnanceur de production ; c'est une passerelle de
pilote sécurisée et testable.

### Flux

1. L'utilisateur ouvre `Adjustment`, renseigne temporairement URL HTTPS et clé d'accès puis teste
   `/health`.
2. Le frontend fabrique un snapshot de calcul. La Vercel Function vérifie l'origine autorisée et
   relaie la requête ; elle ne sauvegarde pas la clé.
3. Le service Windows crée `%ProgramData%\BTM\StarNet\work\<jobId>\`.
4. Il écrit `.dat`, `.prj` et fichiers nécessaires en CRLF depuis les templates validés.
5. Il lance la CLI standard de l'installation Typical :

   ```bat
   "C:\Program Files\MicroSurvey\StarNet 14\StarNet.exe" "<project.prj>" /RUN
   ```

   Le chemin x86 est un fallback explicite.
6. Il attend la fin avec timeout, détecte les fenêtres/processus bloqués, collecte code retour,
   console, `.run`, `.lst`, `.pts`, `.err` et `.dmp` lorsqu'il existe.
7. Les parsers structurent coordonnées, résidus, χ², variance, exclusions et erreurs. La réponse
   indique toujours moteur, version, convergence confirmée ou non et fichiers disponibles.
8. Le frontend rend le résultat sans l'écrire dans les mesures de démo.

Chaque job a un dossier et un identifiant distincts. Le nombre maximal d'exécutions concurrentes est
configurable mais reste `1` dans le pilote tant que la licence et le comportement CLI ne sont pas
validés. Une file d'attente/lock est préférable à plusieurs processus concurrents non maîtrisés.

### Contrat HTTP minimal

- `GET /health` : statut, disponibilité de STAR*NET/script et capacité concurrente ;
- `POST /jobs` ou équivalent : snapshot/fichiers, idempotency key, mode CLI ;
- `GET /jobs/{id}` : queued/running/succeeded/failed/timeout et résultat ;
- annulation facultative et bornée ;
- erreurs typées, tailles et extensions autorisées, limite de requête et timeout.

Le frontend ne doit pas rester indéfiniment sur `Running` : polling borné, reprise après refresh si un
job ID existe en mémoire, bouton de vérification et message timeout. Un dialogue STAR*NET (`Data line
too long`, options invalides, licence) doit être transformé en échec, jamais attendre une intervention
graphique invisible.

### Sécurité

- Le service écoute localhost ; Cloudflare Quick Tunnel fournit temporairement une URL HTTPS.
- La VM n'expose pas directement le port HTTP sur Internet.
- La clé est générée à l'installation, affichée pour copie puis fournie dans l'en-tête attendu.
- URL et clé du pilote peuvent changer au redémarrage du tunnel ; la clé de service n'a pas besoin de
  changer si la configuration locale est conservée.
- La maquette garde la clé uniquement en mémoire d'onglet : ni processing, localStorage, IndexedDB,
  GitHub, logs Vercel ni capture de test.
- Ne jamais transmettre une clé dans un chat, commit, URL, query string ou fixture.
- Le Quick Tunnel est un outil de recette, pas le réseau final BTM.

Les scripts opérationnels et commandes exactes restent près du code dans
`server/starnet14-service/README.md` et `server/starnet14/README.md`.

## Parsing et transaction

Le parser ne dépend pas d'une seule mise en page fragile : variantes d'en-têtes connues, validation des
colonnes/unités, mapping par engine name, doublons/inconnus bloquants et diagnostic brut borné.
`not-applicable` χ² reste distinct de passed/failed. Un `.err` ou code retour ne suffit pas seul : la
présence et la cohérence des sorties attendues confirment l'achèvement.

En BTM réel, la publication est transactionnelle : résultats parsés + diagnostic minimal + état du run
+ UPSERT des variables. Sans commit base réussi, le job n'est pas déclaré publié. Tous les fichiers
sont régénérables depuis le snapshot/version ; ils ne sont pas l'historique officiel.

Les résultats natifs et preview partagent un contrat d'affichage mais gardent leur provenance.

## Reprise BTM

Le développeur remplace dans cet ordre les adaptateurs, sans réécrire les composants métier :

1. enums/tables et contrats de version ;
2. repositories démo par API BTM/raw_data ;
3. persistance des sorties et runs ;
4. file de jobs/idempotence ;
5. service Windows et lock licence ;
6. ordonnanceur/catch-up/reprocessing ;
7. durcissement Analysis Lab et audit.

Les points d'intégration exacts, décisions ouvertes et tests de sortie sont dans
[`VALIDATION.md`](VALIDATION.md).
