# Frontend — administration, Analysis Lab et reprocessing

## 1. Liste des processings

Colonnes : nom, scope, stations, version active, statut, dernier slot, qualité, prochaine action.
Actions : Open, Edit, **Analysis Lab**, Run now, Activate/Deactivate processing, Duplicate,
Archive processing. `Analysis Lab` ouvre directement le laboratoire du processing depuis la page
principale ; il ne faut pas obliger l'utilisateur à ouvrir d'abord le détail d'administration.

Ne pas surcharger la liste avec les paramètres topographiques. Afficher les anomalies sous forme
de badges et ouvrir le détail.

## 2. Administration d'un processing

Onglets :

1. Overview
2. Configurations
3. Stations & Measurements
4. Point Identity
5. Initialisation
6. Adjustment
7. Run & Synchronisation
8. Output Variables
9. Runs
10. Reprocessing
11. Analysis
12. Audit

Les onglets réutilisent les mêmes composants que le wizard. Une modification d'une version utilisée
crée un draft à partir de cette version ; elle ne modifie jamais l'objet historique.

`Edit` ouvre le wizard prérempli depuis la version active, ou la dernière version si aucune n'est
active. L'enregistrement crée la version suivante. Les variables de sortie existantes conservent
leur identifiant ; seules les variables nécessaires à de nouvelles cibles publiées sont ajoutées.

## 3. Configurations

### Timeline

Afficher les intervalles `[validFrom, validTo[` et les états draft/active/archived. Contrôles :

- pas de chevauchement actif ;
- pas de trou silencieux pour une période à recalculer ;
- une seule version active pour le présent ;
- version historique archivée toujours sélectionnable par le resolver.

### Actions

- Duplicate as draft ;
- Compare ;
- Activate from date ;
- Archive ;
- Restore as new draft ;
- View resolved snapshot.

Supprimer définitivement une version utilisée est interdit.

### Diff

Regrouper les changements : stations, variables, measurement setups, points physiques, références,
initialisation, ajustement, run, output et templates. Afficher valeur avant/après, unité, source et
impact attendu.

## 4. Run details

Onglets : Summary, Network, Coordinates, Residuals, Quality, Auto Adjust attempts, Input snapshot,
STAR*NET diagnostics.

### Summary

- slot publié ;
- version utilisée ;
- trigger ;
- état final/provisoire ;
- époques par station ;
- disponibilité cibles/références ;
- χ²/facteur de variance ;
- durée et erreur technique éventuelle.

### Network

Vue E/N avec stations, références, cibles, rayons, points exclus et ellipses de confiance.
Exagération réglable mais affichée clairement.

### Residuals

Table filtrable : observation, station, cible, type Hz/Vz/Sd, valeur, sigma, résidu, résidu
standardisé, redondance, statut. Unités : angles en arcsec/gon selon affichage, distance en mm.

### Input snapshot

Afficher les valeurs résolues et leurs sources, pas nécessairement conserver les fichiers après
le run. Dans la maquette, une preview textuelle peut être reconstruite depuis le snapshot.

## 5. Analysis Lab

### Parcours guidé retenu

L'écran suit six étapes visibles, sans demander à l'utilisateur de connaître le vocabulaire de
compensation avant de commencer :

1. choisir la version de configuration et l'époque ; la version active et le dernier slot sont
   proposés automatiquement ;
2. comprendre le réseau sur une carte E/N qui reste visible même en cas d'échec de rang ;
3. modifier temporairement les observations, précisions, références, coordonnées initiales et
   paramètres, puis choisir le moteur ;
4. sélectionner un trial terminé et inspecter dans une vue synchronisée résidus, rang, χ²,
   facteur de variance, ellipses et deltas par rapport aux coordonnées initiales ;
5. transformer le trial retenu en une **nouvelle version draft datée** ;
6. prévisualiser puis recalculer manuellement une période historique.

Deux moteurs partagent exactement le même snapshot d'entrée :

- `Fast scientific preview` : calcul interactif de la maquette, explicitement non certifié ;
- `STAR*NET 14` : génération `.dat/.prj`, exécution par le service Windows licencié, parsing des
  sorties natives puis adaptation au même contrat de diagnostic et à la même carte.

Les identifiants du service Windows restent en mémoire de l'onglet uniquement. Ils ne sont pas
écrits dans la configuration, le stockage navigateur, GitHub ou Vercel.

### Création d'une session

Choisir processing, version de base et slot/époque. Afficher l'état des sources avant de lancer :
stations présentes, T/P, références, cibles et données réutilisées.

### Disposition

- en-tête compact : version, validité, époque et état des cycles par station ;
- carte réseau : stations, références, cibles, rayons, points physiques partagés et ellipses ;
- **une table Points unique**, synchronisée avec le trial sélectionné : identité physique, stations
  observatrices, contrôle E/N/H, coordonnées initiales, coordonnées ajustées, deltas E/N/H/3D,
  sigmas, ellipse, nombre d'observations et résidu standardisé maximal ;
- ordre de lecture obligatoire : références partagées, références, autres points physiques
  partagés, stations, points de suivi, auxiliaires ;
- détail Hz/Vz/Sd, exclusions et précisions par observation dans une section avancée repliable ;
- résultats : explication en langage simple et sélection du trial ; la carte, les indicateurs et la
  table Points changent ensemble. Il ne doit pas rester plusieurs tables de points concurrentes.

Le code couleur des déplacements est réglable par l'utilisateur en millimètres. Il est purement
visuel et ne modifie jamais χ² ni les règles de publication. La forme du symbole reste l'autorité
pour le rôle du point ; une double auréole violette indique un point physique partagé.

### Overrides autorisés

- activer/désactiver références ;
- modifier coordonnées/sigmas d'une référence ;
- exclure/protéger observations ;
- modifier temporairement Hz/Vz/Sd pour diagnostic ;
- modifier constante/hauteur/setup ;
- modifier poids et centrages ;
- tester paramètres STAR*NET compatibles ;
- exclure station/cible ;
- modifier T/P de test.

Chaque override affiche valeur de base, nouvelle valeur, unité et justification.

Les poids sont séparés par nature :

- sigmas E/N/H des références = contraintes de coordonnées ;
- sigmas Hz/Vz/Sd = précision de mesure par station–cible ;
- centrages et paramètres globaux = configuration d'ajustement.

Une sigma plus petite donne plus d'influence. L'interface doit l'expliquer et afficher la précision
effective après multiplicateur. Une précision validée par station–cible est stockée dans la nouvelle
version et réutilisée par le resolver ; elle ne modifie jamais `raw_data`.

### Trials

- Trial 0 = baseline immuable ;
- Run trial ;
- Duplicate ;
- Undo/reset overrides ;
- sélectionner/restaurer un calcul précédent ;
- Mark as candidate avec justification ;
- Save candidate as new configuration version.

Le trial courant montre χ², facteur de variance, max résidu standardisé, rang, nombre d'exclusions,
ellipses et changements de coordonnées. Toute modification de paramètre, contrôle ou coordonnée
initiale rend le résultat courant obsolète : l'utilisateur doit relancer le calcul avant de pouvoir
sauvegarder.

### Anti-manipulation

Détecter et avertir si le χ² passe principalement parce que :

- les sigmas ont été fortement gonflés ;
- trop d'observations ont été exclues ;
- les degrés de liberté deviennent trop faibles ;
- des références essentielles ont été libérées ;
- les ellipses dépassent les seuils de publication.

### Sauvegarde

En production, le résultat utile est une nouvelle version de configuration et un audit de la
décision. Ne pas dupliquer toutes les coordonnées des trials dans les séries `measures`.

La sauvegarde crée un **snapshot complet et cohérent** du trial retenu ; elle ne propose pas des
cases permettant d'oublier silencieusement une partie de la configuration. Le draft contient :

- les coordonnées ajustées des points libres comme nouvelles coordonnées initiales ;
- les coordonnées/contraintes/sigmas des références, y compris les références libérées ;
- les précisions effectives par station–point ;
- les paramètres d'ajustement et l'état Auto Adjust ;
- les exclusions scalaires explicites ;
- les mappings, stations, instruments, run et outputs hérités de la version de base.

Les modifications temporaires des valeurs mesurées Hz/Vz/Sd restent diagnostiques et ne sont
jamais réécrites dans `raw_data`. Une solution en échec, de rang déficient, avec χ² échoué ou dont
les paramètres ont changé depuis le dernier calcul ne peut pas être sauvegardée. `validFrom` et la
justification sont obligatoires. L'activation reste une action séparée afin de préserver
l'historique et d'imposer un preflight.

## 6. Reprocessing

### Formulaire

- plage from/to ;
- stratégie recommandée : `Use configuration valid for each slot` ;
- option avancée : forcer une version sur la plage ;
- dry-run ou publish ;
- filtres de slots ;
- raison obligatoire.

### Aperçu avant exécution

- nombre de slots ;
- versions utilisées par sous-période ;
- slots sans config/données ;
- résultats existants qui seront remplacés ;
- estimation de charge ;
- warnings de réutilisation/catch-up.

### Publication

Le reprocessing réutilise les variables existantes et UPSERT chaque timestamp. Le détail du run
permet de savoir avec quelle version et pourquoi la valeur a été recalculée.

## 7. Templates

Catalogues : Country preset, Instrument template, Measurement setup, Adjustment, Run, Output.

Un template modifié ne change jamais une configuration existante. L'utilisateur applique une
nouvelle version de template à un draft et consulte le diff.

## Prompt ciblé

> Implémente l'administration, les versions, le détail de run, Analysis Lab et Reprocessing selon
> ce document. Réutilise les formulaires du wizard. Les versions utilisées sont immuables et le
> resolver historique sélectionne la version valide par slot. Analysis Lab doit exécuter de vrais
> trials de démonstration et détecter le gonflement artificiel des poids. Reprocessing doit montrer
> un dry-run et remplacer les valeurs du même timestamp sans créer de nouvelles variables.
