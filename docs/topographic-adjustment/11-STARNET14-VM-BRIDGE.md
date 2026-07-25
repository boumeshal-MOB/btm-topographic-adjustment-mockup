# Pont maquette ↔ VM STAR*NET 14

## 1. Objectif

Faire exécuter une époque préparée par la maquette Vercel sur le vrai STAR*NET 14 Ultimate de la
VM, avec une connexion FTPS réelle mais sans persister d'identifiant FTP/RDP.

Ce pont valide le moteur licencié et ses sorties avant l'intégration dans le véritable backend BTM.
Il ne remplace pas le futur service BTM décrit dans `02-ARCHITECTURE-BTM-CIBLE.md`.

## 2. Flux retenu

```text
Run manuel de la maquette
  → saisie éphémère d'un compte FTPS dédié
  → fonction Vercel /api/starnet-ftp
  → upload atomique btm-<run>.btmjob.json vers queue/incoming
  → worker PowerShell local sur la VM
  → input.dat + project.snproj temporaires
  → StarNet.exe project.snproj /run|/AUTOADJUST ... /NoGraphics
  → collecte .lst/.pts/.err + console
  → queue/outgoing/btm-<run>.btmresult.json
  → polling FTPS court par la fonction Vercel
  → résultat affiché dans la page du run
```

Le navigateur ne se connecte jamais directement en FTP. À chaque opération courte, il transmet la
connexion à la fonction Vercel via HTTPS. Les valeurs restent dans l'état React de l'onglet et ne
sont écrites ni en base, ni en `localStorage`, ni dans un cookie, ni dans l'environnement Vercel.
Un rechargement de page les efface.

La fonction Vercel n'accepte pas un hôte arbitraire. Le nom d'hôte et le port doivent être
explicitement autorisés par `STARNET_ALLOWED_FTP_HOSTS` et `STARNET_ALLOWED_FTP_PORTS`, afin
d'éviter de transformer l'API publique en proxy réseau.

FTPS avec certificat valide est le mode nominal. Le FTP non chiffré n'est proposé que pour le
simulateur Docker local.

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

- aucun secret dans GitHub, `.env`, job ou résultat ;
- identifiants manuels en mémoire de l'onglet uniquement, jamais journalisés par l'application ;
- compte FTP dédié limité aux deux dossiers de queue, jamais un compte administrateur Windows ;
- FTPS avec certificat valide obligatoire entre Vercel et la VM ;
- allowlist serveur exacte des hôtes et ports pour bloquer le SSRF ;
- cache HTTP désactivé pour toutes les réponses de la passerelle ;
- validation stricte des noms et absence de commande shell libre ;
- compte Windows dédié recommandé ;
- mutex global de licence ;
- workspace aléatoire par job ;
- suppression du workspace après création du résultat, sauf diagnostic explicite ;
- ne jamais connecter un runner GitHub public à cette VM.

## 7. Simulateur Docker

`server/simulator` fournit un FTP local et un faux worker déterministe. Il teste la connexion, la
queue, l'interface et les contrats JSON. Il n'installe pas STAR*NET et ne réalise pas d'ajustement
numérique.

STAR*NET et sa licence restent installés nativement sur la VM Windows. Cette séparation est
volontaire : le simulateur peut être reconstruit librement, alors que le moteur propriétaire reste
dans son environnement supporté.

## 8. Limites assumées du premier pilote

- exécution automatique limitée aux runs manuels ;
- pas de secret persistant : après rechargement, il faut ressaisir le compte dédié ;
- l'hôte réel doit être joignable depuis Vercel et proposer FTPS ; sinon un tunnel HTTPS ou un
  déploiement de la passerelle dans le réseau BTM sera nécessaire ;
- aucune publication automatique dans les variables BTM ;
- résultats natifs affichés, mais parsing métier exhaustif à finaliser avec les premières sorties
  produites par cette installation STAR*NET 14 ;
- pas de service Windows installé automatiquement : le watcher est lancé localement pour le pilote.

Le fallback téléchargement/import reste disponible uniquement pour diagnostiquer une indisponibilité
réseau.

## 9. Critères de validation

- le bouton **Test connection** confirme l'accès aux deux dossiers FTPS ;
- **Run now with STAR*NET** envoie le job et récupère le résultat sans transfert manuel ;
- STAR*NET est exécuté sans interface utilisateur ;
- le résultat revient avec `exitCode = 0` et `Network Processing Completed` ;
- convergence et χ² sont reconnus dans la console/listing ;
- `.lst`, `.pts` et `.err` réels sont visibles dans la page du run ;
- aucun secret n'est présent dans le dépôt ou les deux enveloppes ;
- deux jobs ne peuvent pas utiliser simultanément la même licence.
