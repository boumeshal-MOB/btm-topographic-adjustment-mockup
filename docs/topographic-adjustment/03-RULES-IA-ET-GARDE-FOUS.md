# Règles permanentes pour l'IA et garde-fous de réalisation

Ce fichier doit être placé dans les instructions persistantes de l'agent qui construit la
maquette ou la feature BTM. Il complète les règles métier numérotées de
[`domain/20-REGLES-METIER.md`](domain/20-REGLES-METIER.md).

## 1. Méthode de travail

1. Lire les documents cités par le prompt du lot avant de modifier le code.
2. Auditer le dépôt et ses versions installées ; ne jamais supposer la stack depuis un exemple.
3. Produire un plan court par vertical slice et identifier les composants réutilisés.
4. Préserver les changements existants sans rapport avec le lot.
5. Implémenter domaine, tests, adaptateur puis UI dans cet ordre.
6. Terminer chaque lot par typecheck, tests ciblés, build et scénario utilisateur.
7. Signaler une décision manquante au lieu d'inventer une règle topographique.

## 1.1 GitHub et autonomie

- Le repository GitHub est la source de vérité de la maquette.
- L'agent peut créer branches, commits, pushes et Pull Requests sans confirmation intermédiaire.
- L'agent ne merge jamais une PR et ne déploie jamais sur Vercel.
- L'agent ne crée/modifie aucun secret GitHub ou Vercel.
- La première PR livre un parcours fonctionnel mono-station complet, pas seulement un scaffold.
- Une PR empilée indique sa branche de base et les PR dont elle dépend.
- Chaque PR reste reviewable, décrit ses règles couvertes et possède ses propres preuves de test.
- Le Product Owner merge dans l'ordre puis réalise/valide le déploiement final.

## 1.2 Contexte et Graphify

- Lire `PROJECT_MAP.md` avant chaque nouveau lot ou nouvelle session.
- Utiliser `graphify query`, `graphify explain` ou `graphify path` avant un scan large du dépôt.
- Ne pas lire tous les documents quand le Project Map indique une source précise.
- Une relation Graphify `INFERRED` n'est pas une preuve métier et doit être vérifiée dans la source.
- Mettre à jour le Project Map seulement lors d'un changement d'architecture, de contrat ou de statut.
- Régénérer Graphify après une PR structurelle, pas après chaque retouche de style.
- Ne pas indexer les secrets, classeurs bruts, PDF confidentiels, outputs de build ou caches.

## 2. Sources et priorité

En cas de contradiction, appliquer la hiérarchie du `README.md`. Ne jamais prendre l'ancien
prototype, un export batch custom ou une capture d'écran comme source de vérité supérieure aux
décisions produit et fichiers natifs STAR*NET.

Toute valeur non confirmée doit être :

- absente si elle n'est pas nécessaire ;
- marquée `provisional`/`reviewRequired` si elle sert à la démonstration ;
- accompagnée de sa provenance dans la configuration ;
- jamais présentée comme norme nationale.

## 3. Architecture et dépendances

- Le domaine est pur : aucune dépendance React, MSW, IndexedDB ou filesystem.
- Toute I/O passe par une interface de repository/gateway.
- La maquette utilise `DemoRepository` et `DemoAdjustmentEngine`.
- BTM utilise les repositories API et le gateway STAR*NET Windows.
- Les composants frontend ne connaissent ni SQL ni syntaxe de fichier STAR*NET.
- Le builder STAR*NET ne dépend pas de composants UI.
- Les valeurs métier ne sont jamais codées en dur dans un composant.
- Les presets JSON sont parsés et validés, pas importés comme objets aveugles.

## 4. Frontend

- Utiliser TypeScript strict, React, MUI 5, React Router v6, TanStack Query v5,
  react-hook-form, Zod et react-i18next selon la stack BTM décrite.
- Garder le code de feature compatible avec le runtime React 17 de BTM ; isoler le bootstrap
  React 18/Vite éventuel dans la seule shell Vercel.
- Ne pas ajouter Tailwind, Redux local, Formik, Yup ou Axios à cette feature.
- Utiliser le bridge i18n/locale BTM ; ne pas créer un second système de langue.
- Ne pas créer de mode `standard/expert`. Les options avancées sont accessibles à tous.
- Le projet courant est implicite et ne figure pas dans le formulaire General.
- Aucun bouton décoratif : action réelle, état disabled expliqué, ou suppression du bouton.
- Toute unité apparaît dans le label, l'en-tête ou la valeur formatée.
- Toute erreur indique la cause, l'action et l'emplacement à corriger.
- Les grands tableaux ont recherche, filtres, bulk edit et pagination/virtualisation.
- Tous les formulaires sont utilisables au clavier et les statuts ne reposent pas sur la couleur.

## 5. Données et démonstration

- Aucun upload de données Hz/Vz/Sd dans le parcours produit.
- Le classeur ATS34 est converti avant le runtime et devient une fixture immuable.
- La fixture ATS34 est mono-station ; elle ne doit jamais produire de points communs réseau.
- Les scénarios réseau sont dans une fixture synthétique séparée et clairement étiquetée.
- Le solveur navigateur est démonstratif et ne prétend jamais reproduire/certifier STAR*NET.
- MSW et IndexedDB ne deviennent jamais des dépendances de production.
- Le même contrat repository est utilisé par la maquette et le futur adaptateur API BTM.

## 6. Topographie et calcul

- Ne fusionner aucun point sur son nom, son ordre ou sa proximité seule.
- Résoudre EDM, réflecteur, constante, hauteur cible et poids par observation ou
  `station × cible`.
- Appliquer `requiredConstant - alreadyAppliedConstant` une seule fois à Sd.
- Ne pas utiliser `.SCALE` comme correction atmosphérique.
- Ne pas utiliser la réfraction STAR*NET comme correction T/P de distance.
- Pour l'initialisation, utiliser les médianes de la fenêtre et afficher la couverture.
- Ne jamais confondre fenêtre d'initialisation, époque source, slot de sortie et validité de version.
- Ne pas déclarer un run réussi si le calcul est non convergé ou déficient en rang.
- Auto Adjust exclut des observations de l'essai ; il ne modifie jamais `raw_data`.

## 7. Temps, versions et sorties

- Les timestamps sources restent intacts.
- Le slot publié est calculé séparément sur la grille configurée.
- Une version utilisée est immuable ; toute modification crée un draft.
- Un recalcul/catch-up résout la version historiquement valide par slot.
- Les variables de sortie appartiennent au processing et restent stables entre versions.
- Un recalcul fait un UPSERT de la même clé `(variable_id, timestamp)`.
- Ne jamais recréer les anciennes notions `OutputResultVersion`, `new-version` ou conservation de
  plusieurs valeurs concurrentes dans `measures`.

## 8. STAR*NET et service Windows

- STAR*NET Ultimate est le seul moteur de production.
- La Lambda Python stateless est autorisée pour préparation/initialisation/laboratoire. Ne pas y
  exécuter STAR*NET et ne pas introduire S3 ou CoMeT.
- Générer `.dat` et `.snproj` à chaque run dans un workspace isolé.
- Parser uniquement les sorties natives requises, jamais les exports custom des scripts batch.
- Valider complètement le parsing et le mapping avant toute publication.
- Publier mesures et statut de run dans une transaction atomique.
- Supprimer le workspace uniquement après commit réussi ; il ne constitue pas une archive.
- Assainir les noms/arguments ; ne jamais construire une commande shell depuis un label libre.

## 9. Tests obligatoires

- Toute règle P0 possède un test automatisé ou une preuve UI explicitement référencée.
- Les fonctions de temps, correction, mapping, initialisation, noms et outputs ont des tests unitaires.
- Les builders/parsers ont des golden tests FR et UK.
- Les parcours wizard, Analysis Lab, versions et reprocessing ont des tests Playwright MSW.
- Les contrats sensibles ont une seconde piste Playwright/API avec Fastify et PostgreSQL.
- Tester les états vide, chargement, erreur, données tardives, noms homonymes et concurrence.
- Aucun lot n'est terminé avec un typecheck, test ou build rouge sans l'indiquer clairement.

## 10. Interdictions de simplification

L'IA ne doit pas supprimer silencieusement une capacité parce qu'elle est complexe. Elle peut la
placer sous `Advanced options`, derrière une interface ou dans un lot ultérieur documenté. Elle ne
doit pas :

- remplacer les IDs explicites par une déduction de noms ;
- rendre global un paramètre de mesure qui varie par cible ;
- préremplir de fausses coordonnées connues ;
- convertir plusieurs réseaux indépendants en un seul processing ;
- confondre un succès χ² avec la seule absence d'erreur technique ;
- stocker les fichiers temporaires comme source de vérité ;
- changer une configuration historique utilisée ;
- inventer une valeur de production depuis une fixture synthétique.
