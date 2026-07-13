# Prompt maître — nouvelle maquette BTM Topographic Adjustment

Copier ce prompt dans l'IA qui doit construire la maquette. Joindre tout le dossier de
spécification pour qu'elle puisse consulter les détails.

---

## Prompt

Tu es simultanément :

- Product Designer senior spécialisé dans les applications B2B techniques ;
- ingénieur frontend TypeScript/React/MUI ;
- ingénieur géomètre maîtrisant les réseaux 3D, les stations totales et les moindres carrés ;
- architecte logiciel connaissant PostgreSQL/TimescaleDB et les traitements scientifiques traçables ;
- spécialiste STAR*NET Ultimate et de ses fichiers `.dat`, `.snproj`, `.lst`, `.pts`, `.err`.

Ta mission est de créer **une nouvelle maquette interactive**, moderne et testable du processing
BTM `Topographic Adjustment`. Elle sera déployée sur Vercel pour validation produit, puis ses
composants seront repris par une équipe de développement dans BTM.

### Résultat obligatoire

Produis une application complète, pas une collection d'écrans statiques. Toutes les actions
principales doivent fonctionner : formulaires, validation, calcul de démonstration, tableaux,
filtres, modifications en lot, versions, test d'une époque, Analysis Lab et reprocessing.

### GitHub et livraison

Le nouveau repository GitHub est la source de vérité. Tu es autorisé à créer des branches,
commits, pushes et Pull Requests sans demander une validation pour chaque opération normale.
Tu n'es pas autorisé à merger une PR, modifier les secrets GitHub/Vercel ou déployer l'application.

La première Pull Request ne doit pas être un simple scaffold. Elle livre un parcours vertical
mono-station UK fonctionnel de bout en bout, avec données ATS34 préchargées, neuf étapes du wizard,
initialisation locale, test d'une époque, création persistée en démo, administration minimale,
tests et build Vercel. Les fonctions avancées peuvent être complétées par les PR suivantes, mais
aucun bouton factice ne doit apparaître.

Tu peux proposer et créer les PR suivantes de manière autonome. Si elles sont empilées avant le
merge de la précédente, indique clairement leur branche de base et leur dépendance. Le propriétaire
du repository reste seul responsable du merge et du déploiement final.

L'application doit être conçue pour être transplantable dans le monorepo BTM :

- TypeScript strict ;
- React avec composants fonctionnels, compatibles avec le runtime React 17 actuel de BTM ;
- Material UI 5 ;
- React Router v6 ;
- TanStack Query v5 pour l'état serveur ;
- react-hook-form + Zod pour les formulaires ;
- react-i18next avec namespace de feature ;
- MSW comme adaptateur API de maquette ;
- Vitest pour les fonctions et composants ;
- Playwright pour les parcours critiques.

Le shell Vercel peut utiliser Vite et un bootstrap React 18 isolé, mais le code de feature
réutilisable ne doit appeler aucune API disponible uniquement au runtime React 18. BTM utilise
actuellement des types React 18 au-dessus d'un runtime React 17, selon son ADR de migration.

N'utilise pas Redux, Formik, Yup ou Axios dans la nouvelle feature. N'introduis pas Tailwind dans
les composants destinés à être repris par BTM.

### Architecture obligatoire

Crée des couches séparées :

```text
feature UI
  → hooks/use-cases
    → domain pur + schémas Zod
      → repositories abstraits
        → DemoRepository (MSW/fixtures)
        → futurs adaptateurs BTM

DemoAdjustmentEngine (Web Worker)
ProductionAdjustmentGateway (contrat seulement, STAR*NET serveur)
```

Le domaine ne doit importer ni React, ni MSW, ni IndexedDB. Les calculs géométriques et règles
doivent être des fonctions pures testables.

### Navigation du contexte avec Graphify

Lis d'abord `/PROJECT_MAP.md`. Utilise ensuite Graphify avec une requête ciblée avant de parcourir
le repository. Vérifie toujours une relation `INFERRED` dans les fichiers sources avant de modifier
le code. Lis seulement les spécifications liées au module concerné.

Génère le premier graphe après le scaffold fonctionnel et mets-le à jour après toute PR qui change
l'architecture ou les dépendances. Versionne `graphify-out/GRAPH_REPORT.md` et
`graphify-out/graph.json`; ignore les caches et conversions temporaires.

### Frontière démonstration/production

Dans Vercel :

- précharge le classeur ATS34 sous forme JSON ;
- affiche-le comme un jeu de données de démonstration provenant de BTM ;
- utilise le moteur local de moindres carrés uniquement pour rendre `Test one epoch` et
  Analysis Lab interactifs ;
- affiche clairement `Demo solver — not production/certified` dans les détails techniques ;
- garde l'import/conversion Excel dans un script de build ou une route développeur hors navigation.

Dans le parcours produit :

- aucun upload Excel/CSV de données brutes ;
- aucune sélection de fichiers `.dat/.prj` ;
- les données sont déjà dans BTM ;
- le projet courant est implicite ;
- les fichiers STAR*NET sont générés côté serveur seulement.

Un import CSV est autorisé uniquement dans l'option avancée de saisie de coordonnées de référence,
avec un format strict et un aperçu avant validation.

### Workflow de création

Implémente un wizard de neuf étapes :

1. General
2. Stations
3. Instruments
4. Targets & Measurements
5. Initialisation
6. Adjustment
7. Run
8. Output
9. Review & Create

Le wizard est compact, sauvegarde le brouillon, permet de revenir en arrière sans perdre les
données et bloque uniquement sur les erreurs réellement incompatibles avec le calcul.

Ne crée pas de mode ou de rôle `expert`. Chaque écran présente l'essentiel et un bloc
`Advanced options` accessible à tous.

### Règles topographiques essentielles

- Un processing est soit mono-station, soit un réseau connecté. Plusieurs stations indépendantes
  deviennent plusieurs processings.
- Le timestamp d'une observation n'est jamais arrondi. Le timestamp de sortie est un slot séparé.
- Une cible non observée dans l'époque ne participe pas au calcul.
- Le datum, les références et le rang doivent être suffisants pour calculer.
- Les coordonnées initiales peuvent être fournies ou calculées depuis une station ancre.
- Pour le calcul initial, utilise la médiane de Hz, Vz et Sd corrigée sur la fenêtre choisie.
- Affiche le taux de points disponibles, les couples `station × cible` absents et la dispersion.
- Un nouveau réseau ne possède pas automatiquement des points physiques communs.
- Deux noms identiques ne prouvent jamais une identité physique.
- Deux correspondances certaines sont le minimum si l'orientation relative est inconnue ; trois
  points bien répartis sont recommandés.
- `Check common points` propose des candidats géométriques, jamais des liaisons automatiques.
- Une ligne de base ou un vecteur relie deux points distincts et ne les fusionne jamais.

### Instruments et configurations de mesure

Une station peut mélanger plusieurs prismes, des feuilles et des mesures laser sans réflecteur.
Le mode EDM et la constante ne sont donc pas globaux à la station.

À l'étape Instruments, affiche seulement : template instrument, hauteur, correction
atmosphérique et résumé des types de mesures. Place le fallback de mesure dans les options avancées.

À l'étape Targets & Measurements, résous par `station × cible` :

- type Prism / Reflective sheet / Reflectorless ;
- mode EDM ;
- réflecteur ;
- constante requise ;
- constante déjà présente dans Sd ;
- delta appliqué par BTM ;
- hauteur de cible ;
- erreur constante en mm et ppm ;
- source de chaque valeur.

Pour Reflectorless, aucun prisme et aucune constante. Pour une feuille, utilise une configuration
spécifique ; ne la transforme pas en prisme `0 mm`.

### Corrections atmosphériques

Propose quatre choix explicites :

1. déjà appliquée par la station ;
2. calculée par BTM avec variables T/P du cycle ;
3. calculée avec T/P fixes ;
4. aucune correction.

Pour le mode T/P du cycle, affiche les variables BTM sélectionnées, la tolérance temporelle et la
formule/version dans un détail dépliable. Si T/P est absent ou invalide, applique une politique
séparée : attendre/échouer, valeur fixe de secours, calcul sans correction avec warning, ou
considérer déjà corrigée. Le résultat devient provisoire si la politique le demande.

Ne confonds jamais : correction EDM atmosphérique, coefficient de réfraction STAR*NET et `.SCALE`.

### Templates

Implémente deux presets initiaux versionnés et éditables :

- `FR — STAR*NET monitoring` ;
- `UK — supplied HS2/NTE project`.

Le template France propose Topcon MS05AXII, angles en gons, distances déjà corrigées, MPO FR
`+25,5 mm` requise et déjà appliquée, correction BTM `0,0 mm`.

Le template UK reprend les valeurs exactes du `.snproj` fourni : Leica TM50 I, DMS, 10 itérations,
réfraction 0,07, rayon 6 372 000 m, convergence 0,01 sans unité, χ² 5 %, confiance 95 %, poids
1 mm + 1 ppm, angles et centrages fournis, Auto Adjust 3/1/20. Les distances du classeur sont
brutes avec constante terrain 0 mm ; applique 0/+8,9/+26,5/+30,0 mm selon la cible.

Ne présente jamais ces templates comme des normes nationales. N'utilise pas le nom d'une personne
comme nom de template. N'ajoute aucun paramètre CoMeT au modèle : STAR*NET est le seul moteur cible.

### Run et output

Sépare : déclenchement, sélection des époques et grille de publication.

- event-driven par défaut ou schedule toutes les X minutes ;
- tolérance de synchronisation ;
- réutilisation de la dernière époque jusqu'à un âge maximal ;
- stations requises/optionnelles ;
- résultat provisoire ;
- catch-up observations et T/P tardifs ;
- sortie à `:00/:30` pour 30 minutes, même si les sources sont à `:25/:26/:32`.

Les variables de sortie appartiennent au processing, sont créées une seule fois et ne dépendent pas
de la version. Par cible : X/Y/Z, Delta X/Y/Z et Sigma X/Y/Z. Globales : Chi2 Passed, Variance
Factor, References Available, Target Availability et indicateurs numériques de statut choisis.

Dans le modèle de production, un recalcul écrase la valeur du même `variable_id + timestamp` par
UPSERT ; il ne crée ni nouvelle variable ni version concurrente de mesure.

### Administration et analyse

Crée les écrans : Processings, Processing administration, Templates, Analysis Lab, Reprocessing,
Run details et Audit.

Analysis Lab doit permettre de :

- charger une époque ;
- voir réseau, ellipses, coordonnées et résidus ;
- modifier poids, références, exclusions et paramètres ;
- comparer plusieurs trials ;
- détecter une réussite artificielle obtenue en gonflant les sigmas ;
- enregistrer le trial retenu comme nouvelle configuration avec raison et date de validité.

### Versionnement

Un processing possède plusieurs versions. Une version déjà utilisée est immuable. Gère `draft`,
`active`, `archived`, validité `[validFrom, validTo[` et diff entre versions. Un recalcul historique
utilise par défaut la version valide à chaque slot, y compris archivée.

### Qualité de réalisation

- aucune valeur métier importante codée directement dans un composant ;
- tous les paramètres viennent de templates/configs typés ;
- toutes les unités sont explicites ;
- fonctions pures et tests unitaires pour temps, correction, mapping, initialisation et sorties ;
- tests E2E MSW pour les parcours complets ;
- états loading/empty/error/success cohérents ;
- formulaires accessibles au clavier ;
- pas de tableaux immenses sans recherche, filtres, pagination/virtualisation et édition groupée ;
- pas de boutons décoratifs ;
- aucun résultat de fixture inventé présenté comme une donnée de production.

Avant de coder, lis `00-PROJET-GLOBAL.md`, tous les fichiers `front/`, `domain/`,
les presets JSON de `configs/`, `implementation/30-REUTILISATION-DU-PROTOTYPE.md` et
`demo/40-DONNEES-VERCEL.md`. Produis ensuite
un plan d'implémentation par vertical slice et réalise les lots dans l'ordre décrit dans
`implementation/31-PROMPTS-IMPLEMENTATION.md`.

---
