# Pont maquette ↔ VM STAR*NET 14

## 1. Objectif

Faire exécuter une époque préparée par la maquette Vercel sur le vrai STAR*NET 14 Ultimate de la
VM, sans connecter la maquette au serveur et sans publier d'identifiant FTP/RDP.

Ce pont valide le moteur licencié et ses sorties avant l'intégration dans le véritable backend BTM.
Il ne remplace pas le futur service BTM décrit dans `02-ARCHITECTURE-BTM-CIBLE.md`.

## 2. Flux retenu

```text
Run de la maquette
  → téléchargement btm-<run>.btmjob.json
  → copie locale ou FTP vers queue/incoming
  → worker PowerShell local sur la VM
  → input.dat + project.snproj temporaires
  → StarNet.exe project.snproj /run|/AUTOADJUST ... /NoGraphics
  → collecte .lst/.pts/.err + console
  → queue/outgoing/btm-<run>.btmresult.json
  → import dans la page du run
```

Le navigateur ne sait pas se connecter en FTP et ne doit pas recevoir les identifiants du serveur.
Le FTP, s'il est utilisé, transporte uniquement les deux enveloppes JSON entre des dossiers
contrôlés.

## 3. Enveloppe job

Le job contient :

- identifiants non secrets du processing, du run et de la version ;
- slot de sortie ;
- mode `run` ou `auto-adjust` ;
- paramètres Auto Adjust explicites ;
- timeout et demande `/NoGraphics` ;
- texte `input.dat` ;
- texte natif `project.snproj`.

Le job contient des observations et coordonnées du projet : il ne doit pas être commité dans le
dépôt public.

## 4. Enveloppe résultat

Le résultat contient :

- statut, code retour, début et fin ;
- version du binaire STAR*NET sans chemin complet de la VM ;
- stdout/stderr ;
- sorties textuelles natives avec nom, taille et SHA-256 ;
- erreur technique synthétique.

Il ne contient ni nom de machine, ni utilisateur Windows, ni chemin complet, ni secret.

L'import vérifie le schéma, les tailles, les noms de fichiers et l'appartenance au run courant. Dans
la maquette, le résultat reste dans le stockage local du navigateur et n'écrase pas les mesures
simulées.

## 5. Projet STAR*NET natif

Le builder a été aligné sur le vrai format `*STAR*NET 3` observé dans le `.snproj` STAR*NET 14
fourni :

- clés natives `adjustment_type`, `converge_limit`, `distance_std_err`, etc. ;
- sections `Adjustment`, `Listing`, `Instrument` et `DataFileList` ;
- `create_coordinate_file = 1` ;
- paramètres Auto Adjust natifs dans `Listing` ;
- référence relative vers `input.dat`.

Pour un datum local avec station et orientation fixées, le `.dat` ajoute un backsight auxiliaire
fixe `BTMORIxxx` et une direction `DN` fixe à lecture zéro. Le point auxiliaire sert uniquement à
matérialiser l'orientation dans STAR*NET ; il n'est jamais mappé vers une cible ou une sortie BTM.

Les sections Plot/DXF/KML/LandXML sans effet sur l'ajustement automatisé ne sont pas générées.

## 6. Sécurité

- aucun service réseau entrant ajouté ;
- aucun secret dans GitHub, Vercel, `.env`, job ou résultat ;
- validation stricte des noms et absence de commande shell libre ;
- compte Windows dédié recommandé ;
- mutex global de licence ;
- workspace aléatoire par job ;
- suppression du workspace après création du résultat, sauf diagnostic explicite ;
- ne jamais connecter un runner GitHub public à cette VM.

## 7. Limites assumées du premier pilote

- échange manuel ou FTP hors application ;
- aucune publication automatique dans les variables BTM ;
- résultats natifs affichés, mais parsing métier exhaustif à finaliser avec les premières sorties
  produites par cette installation STAR*NET 14 ;
- pas de service Windows installé automatiquement : le watcher est lancé localement pour le pilote.

Ces limites permettent de tester immédiatement la licence, le CLI, le `.dat`, le `.snproj`, Auto
Adjust et les fichiers de sortie sans prendre de décision prématurée sur le réseau BTM.

## 8. Critères de validation

- STAR*NET est exécuté sans interface utilisateur ;
- le résultat revient avec `exitCode = 0` et `Network Processing Completed` ;
- convergence et χ² sont reconnus dans la console/listing ;
- `.lst`, `.pts` et `.err` réels sont visibles dans la page du run ;
- aucun secret n'est présent dans le dépôt ou les deux enveloppes ;
- deux jobs ne peuvent pas utiliser simultanément la même licence.
