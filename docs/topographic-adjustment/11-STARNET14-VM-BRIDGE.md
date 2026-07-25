# Service d’exécution maquette ↔ VM STAR*NET 14

## 1. Objectif du pilote

La maquette doit pouvoir demander un ajustement manuel au vrai STAR*NET 14 Ultimate installé sur
la VM Windows, sans RDP, sans dépôt de fichiers à surveiller et sans exposer les identifiants de la
VM.

Le pilote valide le contrat d’exécution, l’isolation des runs et les sorties natives avant la
reprise dans le backend BTM. Il ne publie pas encore de mesures dans la base BTM.

## 2. Flux retenu

```text
Page d’un run dans la maquette
  → URL HTTPS autorisée + clé saisie dans l’onglet
  → fonction Vercel /api/starnet-service
  → POST /v1/runs sur le service Windows
  → file d’attente en mémoire
  → un slot de licence disponible prend le run
  → dossier aléatoire et isolé pour ce run
  → génération de input.dat et project.snproj
  → StarNet.exe project.snproj /run|/AUTOADJUST ... /NoGraphics
  → lecture et validation des .lst/.pts/.err
  → suppression du dossier temporaire
  → résultat récupéré par GET /v1/runs/{jobId}/result
  → affichage dans la page du run
```

Le programme installé sur la VM est un petit service HTTP Windows. Il reste démarré, accepte les
demandes et lance le script PowerShell fourni pour chaque exécution. Il n’est pas un watcher de
dossiers et il n’exécute aucun calcul par lui-même.

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
- composant `/NoGraphics` disponible ;
- PowerShell 5.1 ou supérieur ;
- droits administrateur uniquement pendant l’installation ;
- un reverse proxy/tunnel HTTPS géré par l’infrastructure pour l’accès distant.

Le moyen le plus simple est de télécharger et décompresser l’artefact
`btm-starnet-windows-service` depuis le dernier run CI de la PR. Il contient le dossier `publish`
et les scripts d’installation : aucun SDK .NET n’est nécessaire sur la VM.

Pour reconstruire ce package depuis le dossier `server\starnet14-service`, sur une machine
disposant du SDK .NET 8 :

```powershell
.\publish-win-x64.ps1
```

Copier le dossier décompressé sur la VM, l’ouvrir, puis lancer PowerShell **en administrateur** :

```powershell
.\install-service.ps1 -LicensedSeats 1
.\test-service.ps1
```

Le script :

1. copie le binaire et le lanceur dans `C:\Program Files\BTM\StarNet Execution Service` ;
2. enregistre un service Windows à démarrage automatique ;
3. génère une clé aléatoire de 256 bits et l’enregistre comme variable machine ;
4. affiche cette clé une seule fois ;
5. garde l’écoute sur `http://127.0.0.1:5080` par défaut.

Ne transmettre la clé ni dans GitHub, ni dans un ticket, ni dans cette conversation. Pour
désinstaller :

```powershell
.\uninstall-service.ps1
```

## 6. Exposition réseau

Le service écoute uniquement sur localhost par défaut. L’équipe infrastructure doit placer devant
lui un reverse proxy ou tunnel avec :

- une URL HTTPS stable et un certificat valide ;
- transfert vers `http://127.0.0.1:5080` ;
- filtrage réseau vers les seuls appelants autorisés ;
- taille de requête supérieure à 4 Mo ;
- timeout adapté aux appels courts de soumission et consultation.

Il ne faut pas exposer directement le port 5080 sur Internet. Le serveur FTP existant peut rester
utilisé par les autres flux BTM, mais il n’est pas nécessaire pour déclencher STAR*NET.

Dans Vercel, définir la valeur non secrète :

```text
STARNET_ALLOWED_SERVICE_ORIGINS=https://starnet-vm.example.internal
```

La fonction refuse toute autre origine, les URL avec chemin ou identifiants, les redirections et le
HTTP non chiffré. Pour le simulateur local seulement :

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
- timeout.

Le service valide le schéma et les tailles, puis utilise deux niveaux de dossiers aléatoires. Le
script collecte uniquement une allowlist de sorties textuelles et remplace les chemins locaux par
`<workspace>`. Les dossiers sont supprimés après lecture, même en cas d’échec, sauf activation
explicite de `PreserveFailedWorkspaces` pour un diagnostic local.

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
- **Run now with STAR*NET** renvoie un résultat sans échange manuel de fichiers ;
- STAR*NET s’exécute en `/NoGraphics` ;
- le résultat réel contient `exitCode = 0` et `Network Processing Completed` ;
- convergence et χ² sont reconnus ;
- les `.lst`, `.pts` et `.err` sont consultables ;
- deux jobs ont des dossiers différents ;
- avec un siège, un seul processus STAR*NET s’exécute à la fois ;
- aucun secret ni chemin local n’apparaît dans les fichiers, logs publics ou dépôt.

La première validation sur la VM reste obligatoire : la CI compile le service et teste ses
contrats, mais elle ne possède ni STAR*NET ni sa licence.
