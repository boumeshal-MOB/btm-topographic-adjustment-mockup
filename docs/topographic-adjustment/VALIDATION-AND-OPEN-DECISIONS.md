# Validation actuelle et décisions ouvertes

Ce document remplace les audits historiques. Il décrit uniquement ce qui est vérifié aujourd'hui,
la recette permanente et les limites encore ouvertes. Une anomalie résolue est protégée par un
test ; elle n'est pas conservée comme dette narrative.

## Verdict actuel

La maquette possède un parcours UK/FR, station unique/réseau, initialisation, preview scientifique,
versions, runs, sorties, administration, Analysis Lab et pilote STAR*NET. Les noyaux Python et
TypeScript couvrent géométrie 3D, corrections, moindres carrés, synchronisation, χ², facteur de
variance, sigmas/ellipses et Auto Adjust de démonstration.

Ces éléments constituent une base réutilisable, pas un moteur certifié ni une intégration BTM de
production. Le prochain travail autorisé est un refactor d'expérience et l'intégration du catalogue
de validation ; les contrats scientifiques ne doivent changer qu'avec preuve et non-régression.

## Contrôles permanents

### Données et identité

- [ ] Les entrées sont mappées explicitement à Hz/Vz/Sd et station/capteur.
- [ ] Une station ou un réseau connecté ; aucun groupe indépendant caché.
- [ ] Aucun shared point n'est déduit d'un nom ; les homonymes distincts restent séparés.
- [ ] Deux à six shared points explicites pour les réseaux du catalogue ; connectivité vérifiée.
- [ ] Configuration de mesure et constantes résolues par station–cible.
- [ ] Références, coordonnées initiales et provenance visibles.

### Calcul

- [ ] Conventions E/N/H, azimut Nord horaire, Vz zénithal et Sd inclinée conservées.
- [ ] Face II normalisée et moyenne angulaire circulaire.
- [ ] Constante puis atmosphère appliquées exactement une fois ; reflectorless delta zéro.
- [ ] Distance horizontale et inclinée jamais confondues.
- [ ] Courbure/réfraction et `.SCALE` séparés de l'atmosphère.
- [ ] Convergence, rang, dof, χ², variance, résidus, sigmas et ellipses cohérents.
- [ ] `not-applicable` ne conserve pas une ancienne valeur binaire χ².
- [ ] Preview signalée non certifiée ; STAR*NET natif identifié comme tel.

### Temps, versions et sorties

- [ ] Source epoch, fenêtre d'initialisation, output slot et validité de version distincts.
- [ ] Synchronisation fresh/reused/missing, provisoire et catch-up borné testés.
- [ ] Le resolver historique choisit la version valide pour chaque slot.
- [ ] Recalcul = UPSERT des variables existantes, pas création de séries concurrentes.
- [ ] Une version utilisée reste immuable et archivable, jamais supprimée.
- [ ] Sauvegarde Analysis Lab = snapshot complet d'un trial encore à jour.

### UX

- [ ] Parcours essentiel utilisable sans ouvrir Advanced.
- [ ] Tous les paramètres nécessaires restent accessibles avec unité/source/aide.
- [ ] Français/anglais, clavier, contrastes et états asynchrones vérifiés.
- [ ] Carte, table Points, observations et trial sont synchronisés.
- [ ] Sélection station/prisme/ligne de visée et édition par objet compréhensibles.
- [ ] Aucun fichier preview brut à éditer, bouton mort ou résultat stale.

### Qualité technique

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run test:python`
- [ ] `npm run check:validation-data`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] CI GitHub verte et preuve visuelle des parcours modifiés.

## Limites réellement ouvertes

### Recette STAR*NET native

- Premier `.dmp` STAR*NET 14 réel à anonymiser et figer pour tester sigmas/ellipses.
- Vérification finale des templates CRLF FR/UK/canonique sans dialogue interactif.
- Détail structuré des observations réellement retirées par Auto Adjust natif ; le listing est
  actuellement la preuve de repli.
- Capacité de licence, concurrence et stratégie de lock/queue de production.
- Options natives disponibles dans l'édition installée et différences preview/native documentées.

### Fonctionnel/BTM

- Saisie et matérialisation complète de toutes les `geometricRelationships` dans Python et
  STAR*NET ; le contrat existe mais toute la chaîne n'est pas encore exposée.
- Publication réelle dans `raw_data/measures`, transactions, file de jobs et audit BTM.
- Choix final tables normalisées vs JSONB pour le snapshot de configuration.
- Politique de rétention des diagnostics runs et sessions Analysis Lab.
- Mapping final métriques/unités du catalogue de variables BTM.
- Formule atmosphérique et plages T/P approuvées pour la production.
- Poids et centrages France approuvés par la cellule topographique.

### Catalogue de validation et UI

- Le catalogue de 100 jeux est généré et vérifié, mais son navigateur/loader et le mode aveugle
  doivent encore être intégrés à l'application.
- Le refactor Analysis Lab doit simplifier les edits au niveau station/prisme/mesure et ajouter la
  sélection synchronisée des lignes de visée sans réécrire les moteurs.
- Les 100 jeux ne nécessitent pas 100 E2E : une matrice ciblée par scénario, complétée par des
  tests de domaine sur tout le manifest, doit être définie dans le code.
- La fixture ATS34 dépend encore d'un convertisseur `xlsx` de développement. Refaire un audit de
  dépendances lors de son remplacement par le catalogue, puis retirer le classeur/convertisseur
  seulement quand aucun parcours ni test de compatibilité n'en dépend.

## Seuil de livraison du prochain refactor

Le travail est prêt à reviewer lorsque :

1. l'application démarre et les parcours existants restent fonctionnels ;
2. le catalogue est parcourable sans charger 12 Mo au démarrage ;
3. au moins un cas propre et un cas de chaque famille de défaut sont testables dans Analysis Lab ;
4. le résultat d'un trial devient obsolète après chaque modification et doit être recalculé ;
5. la table Points unique contient initial/adjusted/deltas/sigmas/ellipse/résidu ;
6. carte et inspecteur permettent de sélectionner station, prisme, shared point et ligne de visée ;
7. les deux identités « même point/noms différents » et « même nom/points distincts » sont claires ;
8. la sauvegarde crée un draft complet sans modifier `raw_data` ni l'historique ;
9. le bundle initial et les temps d'interaction restent acceptables ;
10. toutes les validations exécutables ci-dessus sont vertes, ou le blocage exact est documenté.
