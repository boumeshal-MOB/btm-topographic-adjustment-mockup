# Service d’exécution maquette ↔ VM STAR*NET 14

## 1. Objectif du pilote

La maquette doit pouvoir demander un ajustement manuel au vrai STAR*NET 14 Ultimate installé sur
la VM Windows, sans RDP, sans dépôt de fichiers à surveiller et sans exposer les identifiants de la
VM.

Le pilote valide le contrat d’exécution, l’isolation des runs et les sorties natives avant la
reprise dans le backend BTM. Il ne publie pas encore de mesures dans la base BTM.

## 2. Flux retenu

```text
Étape Adjustment de création/édition
  → préparation et contrôle local d’une époque
  → URL HTTPS autorisée + clé saisie dans l’onglet
  → fonction Vercel /api/starnet-service
  → POST /v1/runs sur le service Windows
  → file d’attente en mémoire
  → un slot de licence disponible prend le run
  → dossier aléatoire et isolé pour ce run
  → génération de input.dat et project.snproj
  → StarNet.exe project.snproj /run|/AUTOADJUST ...
    → /NoGraphics ajouté uniquement pour une installation Custom compatible
  → lecture et validation des .run/.lst/.dmp/.pts/.err
  → suppression du dossier temporaire
  → résultat récupéré par GET /v1/runs/{jobId}/result
  → affichage du résultat natif dans l’étape Adjustment
```

Le programme installé sur la VM est un petit hôte HTTP Windows. En production il fonctionne comme
service Windows. Pour le pilote d’une installation STAR*NET Typical, `START-PILOT` l’exécute
temporairement dans la session de l’utilisateur courant : STAR*NET retrouve ainsi le même profil et
la même licence que le BAT `/RUN` validé sur la VM. Dans les deux cas, l’hôte accepte les demandes
et lance le script PowerShell fourni pour chaque exécution. Il n’est pas un watcher de dossiers et
il n’exécute aucun calcul par lui-même.

Le test connecté sert à valider une configuration avant activation. Les exécutions BTM normales,
planifiées, catch-up ou de recalcul ne demanderont jamais une clé dans le frontend : le futur
backend BTM appellera le même contrat avec un secret géré côté serveur.

## 3. Concurrence et licence

Un seul service gère toutes les demandes :

- chaque demande a son propre dossier éphémère ;
- les jobs en attente ne partagent aucun fichier ;
- `MaximumConcurrentExecutions` doit être égal au nombre de sièges STAR*NET réellement licenciés ;
- la valeur par défaut est `1`, y compris pour une licence de démonstration ;
- chaque slot possède aussi un mutex Windows, comme seconde protection ;
- la capacité de file par défaut est de 500 demandes.

Des dizaines de demandes peuvent donc être reçues en même temps, mais STAR*NET n’est lancé en
parallèle que dans la limite de la licence. Ne jamais augmenter ce nombre sans confirmation écrite
du fournisseur ou de l’administrateur de licences.

## 4. API du service

| Requête | Authentification | Réponse |
|---|---|---|
| `GET /health` | aucune | liveness locale/infrastructure |
| `GET /v1/health` | `X-BTM-StarNet-Key` | disponibilité de STAR*NET et du script |
| `POST /v1/runs` | `X-BTM-StarNet-Key` | job accepté ou erreur de validation |
| `GET /v1/runs/{jobId}` | `X-BTM-StarNet-Key` | état `queued`, `running`, `completed` ou `failed` |
| `GET /v1/runs/{jobId}/result` | `X-BTM-StarNet-Key` | `202` en attente, résultat natif en `200` |

Une seconde soumission du même `jobId` est idempotente pendant sa période de rétention. Les jobs et
résultats sont conservés uniquement en mémoire pendant 60 minutes par défaut. Le service n’est pas
la source de vérité : le futur backend BTM conserve les runs, diagnostics et mesures en base.

## 5. Installation sur la VM

Prérequis :

- Windows x64 ;
- STAR*NET 14 Ultimate installé et activé ;
- installation Typical (CLI standard) ou Custom avec composant `/NoGraphics` ;
- PowerShell 5.1 ou supérieur ;
- droits administrateur pendant le premier lancement ;
- accès Internet sortant depuis la VM pour le tunnel temporaire.

Le moyen le plus simple est de télécharger et décompresser l’artefact
`btm-starnet-windows-service` depuis le dernier run CI de la PR. Il contient le dossier `publish`
et les scripts d’installation : aucun SDK .NET n’est nécessaire sur la VM.

Pour reconstruire ce package depuis le dossier `server\starnet14-service`, sur une machine
disposant du SDK .NET 8 :

```powershell
.\publish-win-x64.ps1
```

Copier le dossier décompressé sur la VM, l’ouvrir, puis double-cliquer sur :

```text
START-PILOT.cmd
```

Accepter la demande d’autorisation administrateur de Windows. Le lanceur enlève le marquage
« fichier téléchargé depuis Internet » uniquement sur les fichiers du package et utilise
`ExecutionPolicy Bypass` uniquement dans le processus PowerShell qu’il ouvre. Il ne modifie pas la
politique PowerShell de l’utilisateur ou de la machine.

Le lanceur :

1. installe le service Windows s’il n’est pas encore présent ;
2. met à jour automatiquement les binaires d’un service pilote déjà installé lorsque le package
   téléchargé est plus récent, sans modifier sa clé ni sa configuration ;
3. génère une clé aléatoire de 256 bits avec une méthode testée sous Windows PowerShell 5.1,
   puis l’enregistre dans une variable machine ;
4. pour une installation Typical, arrête temporairement le service Windows et démarre le même hôte
   HTTP dans la session Windows courante ;
5. vérifie STAR*NET et le lanceur local ;
6. télécharge le client Windows officiel `cloudflared` s’il manque ;
7. crée une connexion HTTPS **sortante** et temporaire, sans ouvrir de port entrant ;
8. tente un test depuis la VM à travers cette URL ;
9. affiche l’URL et la clé à saisir dans l’étape Adjustment de la maquette.

Certaines VM ne savent pas résoudre leur propre hostname `trycloudflare.com` alors que l’URL est
joignable depuis Vercel. Ce défaut de self-check ne coupe plus le tunnel : le lanceur affiche
`URL IS READY FOR EXTERNAL TEST` et le bouton **Test service** devient le contrôle externe
déterminant. Un self-check qui répond mais indique STAR*NET indisponible reste bloquant.

Il faut garder la VM allumée pendant l’essai. Pour couper immédiatement l’URL publique,
double-cliquer sur :

```text
STOP-PILOT.cmd
```

Cette commande arrête le tunnel et l’hôte interactif, puis redémarre le service Windows s’il était
actif avant le pilote.

Ne transmettre la clé ni dans GitHub, ni dans un ticket, ni dans cette conversation. Pour
désinstaller :

```powershell
.\uninstall-service.ps1
```

## 6. Connexion réseau du pilote

Pour cette maquette, `start-pilot.ps1` utilise un **Cloudflare Quick Tunnel** :

- aucun compte ou domaine Cloudflare n’est requis ;
- la VM initie elle-même la connexion vers Internet ;
- aucun port entrant et aucune règle FTP ne sont ajoutés ;
- l’URL aléatoire se termine par `.trycloudflare.com` ;
- l’URL cesse de fonctionner dès que `stop-pilot.ps1` est lancé ou que la VM s’arrête ;
- une nouvelle exécution génère généralement une nouvelle URL ;
- la clé API reste obligatoire pour les endpoints `/v1/*`.

`vercel.json` autorise uniquement la forme canonique d’un hostname HTTPS Quick Tunnel pour ce
pilote. La fonction refuse les chemins injectés, identifiants dans l’URL, sous-domaines imbriqués,
redirections et protocoles non chiffrés. Elle ne permet d’appeler que les endpoints STAR*NET codés
dans la fonction.

Il s’agit d’un accès de développement temporaire, sans garantie de disponibilité. Pour BTM réel,
le Quick Tunnel devra être supprimé au profit du réseau privé BTM ou d’un tunnel HTTPS stable
approuvé.

Un hostname HTTPS stable peut aussi être autorisé explicitement avec :

```text
STARNET_ALLOWED_SERVICE_ORIGINS=https://starnet-vm.example.internal
```

Pour le simulateur local seulement :

```text
STARNET_ALLOWED_SERVICE_ORIGINS=http://127.0.0.1:5080
STARNET_ALLOW_INSECURE_LOCALHOST=true
```

## 7. Secrets

Pour le pilote manuel :

- l’utilisateur saisit l’URL et la clé dans la page ;
- la clé reste dans l’état React de l’onglet ;
- elle n’est écrite ni dans `localStorage`, ni dans la configuration du processing, ni dans GitHub,
  ni dans les variables Vercel ;
- elle transite par la fonction Vercel à chaque opération et disparaît à la fin de la requête ;
- un rechargement efface la clé.

Dans BTM réel, la clé doit être gérée par le secret store/backend BTM et ne doit plus être saisie
par l’utilisateur.

## 8. Isolation et fichiers

Le job contient les fichiers natifs générés pour le run :

- `input.dat` ;
- `project.snproj` ;
- identifiants du processing, run et version ;
- mode normal ou Auto Adjust ;
- mode de lancement CLI standard ou `/NoGraphics` ;
- timeout.

Le service valide le schéma et les tailles, puis utilise deux niveaux de dossiers aléatoires. Le
script collecte uniquement une allowlist de sorties textuelles et remplace les chemins locaux par
`<workspace>`. Les dossiers sont supprimés après lecture, même en cas d'échec, sauf activation
explicite de `PreserveFailedWorkspaces` pour un diagnostic local.

Le dossier d'exécution effectif du service installé est
`%ProgramData%\BTM\StarNet\work\<jobId>-<guid>`. Il est normalement vide entre deux runs car chaque
workspace est supprimé après collecte. Le script réécrit `input.dat` et `project.snproj` en ASCII
avec fins de ligne Windows `CRLF` avant d'appeler STAR*NET.

Les fichiers ne sont jamais une source de vérité et peuvent contenir des informations projet : ne
pas les commiter.

## 9. Simulateur local

`server/simulator` implémente la même API avec la bibliothèque standard Python et une file
d’attente. Il permet de tester Vercel et l’interface sans licence. Il affiche clairement que ses
sorties ne sont pas des résultats numériques STAR*NET.

STAR*NET reste installé nativement sur Windows ; il n’est ni copié ni simulé dans Docker.

## 10. Critères de validation sur la vraie VM

- `test-service.ps1` confirme la présence de STAR*NET et du lanceur ;
- **Test service** affiche `Service ready` dans la maquette ;
- une installation Typical affiche `interactive pilot` dans l’état du service ;
- **Run now with STAR*NET**, dans Adjustment, renvoie un résultat sans échange manuel de fichiers ;
- une installation Typical s’exécute en **Standard CLI**, comme le BAT validé sur la VM ;
- `/NoGraphics` n’est envoyé que si STAR*NET a été installé en mode Custom avec cette option ;
- le résultat réel contient un `.run` non fatal et un `.lst` complet ; un code non nul peut être un
  warning ou un échec χ² et ne doit pas être confondu avec une erreur d'exécution ;
- convergence et χ² sont reconnus ;
- les `.run`, `.lst`, `.dmp`, `.pts` et `.err` disponibles sont consultables ;
- deux jobs ont des dossiers différents ;
- avec un siège, un seul processus STAR*NET s’exécute à la fois ;
- aucun secret ni chemin local n’apparaît dans les fichiers, logs publics ou dépôt.

La première validation sur la VM reste obligatoire : la CI compile le service et teste ses
contrats, mais elle ne possède ni STAR*NET ni sa licence. Une installation Typical lancée sous le
compte système Windows est refusée explicitement : ce mode doit passer par l’hôte interactif du
pilote. En production, le compte configuré pour l’hôte devra disposer de la licence et du profil
STAR*NET nécessaires.
