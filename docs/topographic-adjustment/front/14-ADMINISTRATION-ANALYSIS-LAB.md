# Frontend — administration, Analysis Lab et reprocessing

## 1. Liste des processings

Colonnes : nom, scope, stations, version active, statut, dernier slot, qualité, prochaine action.
Actions : Open, Edit, Run now, Activate/Deactivate processing, Duplicate, Archive processing.

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

### Création d'une session

Choisir processing, version de base et slot/époque. Afficher l'état des sources avant de lancer :
stations présentes, T/P, références, cibles et données réutilisées.

### Disposition

- colonne gauche : paramètres et overrides ;
- centre : carte réseau + ellipses ;
- droite/bas : diagnostics, résidus, χ² et comparaison des trials.

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

### Trials

- Trial 0 = baseline immuable ;
- Run trial ;
- Duplicate ;
- Undo/reset overrides ;
- Compare sélection ;
- Mark as candidate avec justification ;
- Save candidate as new configuration version.

La comparaison montre χ², facteur de variance, max résidu standardisé, rang, nombre d'exclusions,
ellipses et changements de coordonnées.

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
