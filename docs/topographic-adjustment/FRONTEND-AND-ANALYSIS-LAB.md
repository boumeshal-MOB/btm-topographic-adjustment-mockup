# Frontend et Analysis Lab — objectifs UX

## Liberté de conception

Le prochain refactor n'a pas pour objectif de reproduire la maquette actuelle. Le concepteur a
une liberté complète sur la composition, la navigation locale, les composants, la densité et les
visualisations, à condition de préserver les règles métier, les fonctions validées et les parcours
testables. Il doit supprimer les répétitions et rendre le produit plus évident pour un utilisateur
occasionnel comme pour un géomètre expert.

STAR*NET sert d'inspiration fonctionnelle pour le laboratoire — carte réseau, stations, lignes de
visée, sélection d'observations, résidus et ellipses — pas de modèle graphique à copier. La
maquette doit avoir une identité BTM moderne, compacte et accessible.

## Principes d'interface

- Une action principale claire par vue ; détails progressifs, jamais un mur de paramètres.
- Aucun mode standard/expert : des sections `Advanced` repliables et recherchables.
- Valeurs résolues, unités, source et impact visibles au bon moment.
- Les erreurs indiquent la cause, les objets concernés et l'action possible.
- Le code couleur n'est jamais l'unique signal ; rôle et qualité ont texte/symbole/forme.
- Navigation clavier, focus visible, labels accessibles, contraste et responsive desktop/tablette.
- Français et anglais complets via i18n ; jargon géomètre naturel, pas une traduction littérale.
- États loading/empty/error/provisional/success et résultats obsolètes couverts.
- Pas de bouton mort ni de contrôle simulé présenté comme fonctionnel.

## Composants à mutualiser

Les formulaires de station, setup de mesure, points physiques, références, initialisation,
ajustement, run et output sont partagés entre création, édition, version diff et Analysis Lab.
Les tables techniques utilisent sélection, filtres, colonnes configurables, en-têtes figés,
virtualisation si nécessaire et inspecteur latéral plutôt que plusieurs tableaux concurrents.

Les concepts de présentation recommandés — et non une structure imposée — sont : résumé de
configuration, indicateurs qualité, table de points, table d'observations, carte réseau, inspecteur
de sélection, timeline de version et comparateur de trials.

## Parcours de création

### Général et stations

La vue générale demande uniquement nom, description, scope et template. Elle montre en résumé
compact la période observée, dernière observation, volume, cibles, variables et qualité de
métadonnées. `Project` n'est pas affiché comme choix puisqu'il vient du contexte BTM.

Stations montre uniquement les stations disponibles avec dernière observation, cibles, cycle,
T/P et disponibilité. Une station suffit pour `single-station`; plusieurs doivent former un
réseau. Le texte ne doit pas prétendre que deux stations sont reliées avant confirmation.

### Instruments et mesures

La carte station contient instrument, hauteur et politique atmosphérique. Les trois choix
principaux sont : correction déjà appliquée, calcul T/P du cycle, calcul T/P fixes ; `None` reste
une décision avancée. La formule, les valeurs utilisées et le chemin de fallback sont accessibles
dans un détail, pas étalés par défaut.

EDM, type de cible, réflecteur, constantes requise/déjà appliquée/delta, hauteur de cible et poids
sont édités dans le tableau/drawer du couple station–cible. Les setups mixtes et bulk edits sont
possibles sans transformer un choix en valeur globale implicite.

### Cibles et points physiques

Le tableau principal montre station, nom BTM, rôle, inclusion, publication, type de mesure, setup,
constante résolue, point physique et état de revue. Les références et points partagés sont
facilement repérables mais restent deux notions distinctes.

Pour un réseau neuf : aucun point commun préconfirmé. L'utilisateur saisit les premières paires
réelles ; après initialisation, `Check common points` peut aligner les nuages et proposer des
paires dans une tolérance en mm. Une liste de candidats est modifiable avant confirmation. Les
points confirmés sont séparés des autres cibles ; les homonymes connus comme distincts sont aussi
montrés séparément afin d'éviter toute illusion de mapping automatique.

### Initialisation

Le premier choix est `Calculate in a local datum` pour un nouveau processing sans coordonnées
connues. L'utilisateur choisit la station fixe, XYZ et orientation, puis une période de données.
La vue explique que cette période sert à calculer les représentatives médianes et n'est pas une
date de validité. Avant calcul : nombre de cycles, couverture cible/station, points manquants et
dispersions. Après calcul : coordonnées initiales, provenance et qualité. L'autre voie permet de
saisir/importer des références réellement connues.

### Ajustement, run, output et review

Adjustment montre paramètres essentiels et qualité ; les poids, centrages, datum, courbure,
réfraction, Auto Adjust et options natives sont avancés. Le bouton de test scientifique/STAR*NET
se trouve ici, avec résultat et fichiers générés lisibles, pas dans la page d'exploitation.

Run sépare trigger, assemblage des époques et catch-up. Des exemples concrets expliquent fraîche,
réutilisée, manquante et provisoire. Output prévisualise la grille UTC et le nombre exact de
variables. Review compare la configuration résolue au template et bloque uniquement sur des
causes actionnables.

## Administration

La page principale liste les processings et donne directement `Edit`, `Run now`, `Analysis Lab`,
activate/deactivate, duplicate et archive. Les brouillons du wizard restent reprenables.

Edit charge une copie complète de la version active/dernière dans le wizard. Sauvegarder crée une
nouvelle version ; les mappings et variables de sortie existants restent stables. Le détail d'un
processing présente synthèse/runs, timeline des configurations, paramètres résolus, sorties et
reprocessing sans recopier les mêmes formulaires en variantes divergentes.

## Analysis Lab — objectif

Le laboratoire doit permettre de comprendre pourquoi un ajustement réussit ou échoue, d'essayer
une correction scientifiquement traçable puis d'enregistrer la configuration retenue. Il ne doit
pas devenir un éditeur de fichier `.dat/.prj` ni une grille où l'utilisateur change des nombres
bruts sans savoir à quel objet ils appartiennent.

### Entrée et mode aveugle

Depuis la page principale ou un processing : choisir version et époque/jeu de validation. La
version active et le dernier slot sont proposés. Pour les jeux synthétiques, le mode aveugle cache
la vérité et le type d'anomalie ; `Reveal expected answer` est une action explicite destinée à la
recette.

### Espace d'analyse unifié

La disposition exacte est libre, mais les sélections doivent rester synchronisées :

- **carte E/N** avec stations, références, points de suivi, points physiques partagés, ellipses et
  lignes de visée ; symboles distincts pour rôles et double auréole pour shared ;
- sélection d'une station, d'un point, d'un prisme ou d'une ligne de visée depuis la carte ou la
  table ; surbrillance réciproque et inspecteur commun ;
- filtres par rôle, station, composante Hz/Vz/Sd, état, résidu et exclusion ;
- exagération des ellipses/déplacements clairement affichée comme visuelle ;
- **une seule table Points** : shared references, references, autres shared points, stations,
  monitoring puis auxiliaires ; identité, observé depuis, contrôle, initial E/N/H, ajusté E/N/H,
  ΔE/ΔN/ΔH/Δ3D en mm, sigmas, ellipse, observations et max résidu standardisé ;
- détail des observations de la sélection avec valeur, sigma, résidu, redondance, face, setup et
  trace des corrections.

Il ne doit pas subsister un tableau « résultats » et un autre tableau « références » qui montrent
des valeurs différentes pour le même trial. Carte, indicateurs, points et observations changent
ensemble quand le trial sélectionné change.

### Modification simple par objet métier

Le geste principal est : sélectionner l'objet sur la carte/table, modifier dans l'inspecteur, puis
relancer. Les contrôles sont adaptés au type sélectionné :

- **prisme/target binding** : inclure/exclure, rôle, setup, hauteur, constante, poids Hz/Vz/Sd,
  publication et identité physique ;
- **mesure ou composante** : inclure/protéger, sigma, marqueur de revue ; une valeur Hz/Vz/Sd peut
  être surchargée temporairement uniquement pour diagnostic, avec valeur source conservée ;
- **référence** : fixed/weak/free par E/N/H, coordonnée et sigma ;
- **station** : coordonnées/orientation initiales, hauteur, instrument et politique T/P ;
- **ligne de visée** : ses faces/composantes, résidus, setup et correction appliquée ;
- **ajustement** : seuils, centrages, courbure/réfraction, pondération et Auto Adjust.

Ne pas demander à l'utilisateur d'éditer le texte du preview STAR*NET. `.dat/.prj` restent un
artefact dérivé en lecture seule pour audit/téléchargement. Une modification temporaire de mesure
ne réécrit jamais `raw_data`.

### Trials

- Trial 0 est la baseline immuable.
- Toute modification crée un état non calculé/obsolète ; les anciennes valeurs ne sont pas
  présentées comme le résultat des nouveaux paramètres.
- `Run trial` utilise le même snapshot pour le preview Python et STAR*NET.
- Le comparateur montre convergence, rang, dof, χ², variance, max |v|/σ, exclusions et deltas.
- Sélectionner un trial restaure paramètres, carte, tableau, résidus et explication.
- Les suggestions automatiques restent des hypothèses ; une référence déplacée, une vibration de
  station et une faute isolée ne doivent pas être confondues sans preuve.
- Avertir quand un succès provient surtout de sigmas gonflées, trop d'exclusions, références
  libérées, dof faibles ou ellipses dégradées.

### Enregistrement

Un trial convergé, plein rang, acceptable et encore à jour peut devenir une **nouvelle version
draft datée**. La sauvegarde est globale, pas une série de cases qui pourraient oublier une partie
du snapshot. Elle contient nouvelles coordonnées initiales des points libres, contraintes des
références, setups/poids effectifs, paramètres, exclusions, mappings et le reste hérité. La raison
et `validFrom` sont obligatoires. L'activation est séparée et les anciens runs restent immuables.

## Critères UX de recette

- Un nouveau venu termine le parcours station unique sans ouvrir les options avancées.
- Un géomètre peut retrouver chaque paramètre STAR*NET utile et sa provenance.
- Un réseau ne paraît jamais connecté avant confirmation des points/contraintes.
- Une anomalie du catalogue peut être explorée sans lire de JSON ou modifier un fichier.
- Une sélection carte ↔ ligne de visée ↔ observation est cohérente et réversible.
- Changer un poids, une référence ou un setup invalide le résultat et met à jour le prochain trial.
- Le même écran fonctionne en français et en anglais, avec unités et termes métier corrects.
- Les moteurs existants restent derrière leurs contrats ; le refactor visuel ne duplique pas les
  formules dans les composants.
