# STAR*NET 14 et service Windows

## But

La maquette peut envoyer un snapshot d'ajustement à une VM Windows où STAR*NET 14 Ultimate est
installé, récupérer les fichiers natifs et présenter le résultat dans le même contrat que le
preview scientifique. Le service ne remplace ni BTM ni un ordonnanceur de production ; c'est une
passerelle de pilote sécurisée et testable.

## Flux du pilote

1. L'utilisateur ouvre `Adjustment`, renseigne temporairement URL HTTPS et clé d'accès puis teste
   `/health`.
2. Le frontend fabrique un snapshot de calcul. La Vercel Function vérifie l'origine autorisée et
   relaie la requête ; elle ne sauvegarde pas la clé.
3. Le service Windows crée `%ProgramData%\BTM\StarNet\work\<jobId>\`.
4. Il écrit `.dat`, `.prj` et fichiers nécessaires en CRLF depuis les templates validés.
5. Il lance la CLI standard de l'installation Typical :

   ```bat
   "C:\Program Files\MicroSurvey\StarNet 14\StarNet.exe" "<project.prj>" /RUN
   ```

   Le chemin x86 est un fallback explicite.
6. Le service attend la fin avec timeout, détecte les fenêtres/processus bloqués, collecte code
   retour, console, `.run`, `.lst`, `.pts`, `.err` et `.dmp` lorsqu'il existe.
7. Les parsers structurent coordonnées, résidus, χ², variance, exclusions et erreurs. La réponse
   indique toujours moteur, version, convergence confirmée ou non et fichiers disponibles.
8. Le frontend rend le résultat sans l'écrire dans les mesures de démo. Le dossier peut être
   supprimé après collecte ; un échec peut être conservé temporairement selon la politique locale.

Chaque job a un dossier et un identifiant distincts. Le nombre maximal d'exécutions concurrentes
est configurable mais reste `1` dans le pilote tant que la licence et le comportement CLI ne sont
pas validés. Une file d'attente/lock est préférable à plusieurs processus concurrents non maîtrisés.

## Contrat HTTP minimal

- `GET /health` : statut, disponibilité de STAR*NET/script et capacité concurrente ;
- `POST /jobs` ou équivalent : snapshot/fichiers, idempotency key, mode CLI ;
- `GET /jobs/{id}` : queued/running/succeeded/failed/timeout et résultat ;
- annulation facultative et bornée ;
- erreurs typées, tailles et extensions autorisées, limite de requête et timeout.

Le frontend ne doit pas rester indéfiniment sur `Running`: polling borné, reprise après refresh si
un job ID existe en mémoire, bouton de vérification et message timeout. Un dialogue STAR*NET
(`Data line too long`, options invalides, licence) doit être transformé en échec, jamais attendre
une intervention graphique invisible.

## Sécurité du pilote

- Le service écoute localhost ; Cloudflare Quick Tunnel fournit temporairement une URL HTTPS.
- La VM n'expose pas directement le port HTTP sur Internet.
- La clé est générée à l'installation, affichée pour copie puis fournie dans l'en-tête attendu.
- URL et clé du pilote peuvent changer au redémarrage du tunnel ; la clé de service n'a pas besoin
  de changer si la configuration locale est conservée.
- La maquette garde la clé uniquement en mémoire d'onglet : ni processing, localStorage,
  IndexedDB, GitHub, logs Vercel ni capture de test.
- Ne jamais transmettre une clé dans un chat, commit, URL, query string ou fixture.
- Le Quick Tunnel est un outil de recette, pas le réseau final BTM.

Les scripts opérationnels et commandes exactes restent près du code dans
`server/starnet14-service/README.md` et `server/starnet14/README.md`.

## Génération native

Le `.dat` est construit depuis les noms moteur et valeurs déjà résolues. Une station locale peut
être fixée XYZ et orientation 0 ; lorsque STAR*NET a besoin d'une direction, le générateur ajoute
un point d'orientation interne déterministe, clairement identifié et exclu du mapping des sorties.
Le fichier n'invente pas des coordonnées de référence.

Le `.prj` doit partir du template natif fourni et déjà accepté par STAR*NET 14. Le générateur
remplace seulement les valeurs autorisées, garde des lignes courtes, l'encodage/CRLF attendu et
évite de reconstruire un fichier d'options à partir de suppositions. `.SCALE` est un facteur
datum/grille, pas une correction T/P.

Les transformations prisme/atmosphère peuvent être appliquées en amont à Sd si le `.dat` trace
des distances corrigées ; dans ce cas aucune directive native ne doit les appliquer une seconde
fois. Inversement, si un template natif porte une correction, le snapshot l'indique et le
prétraitement s'abstient. Les tests golden vérifient la chaîne.

## Parsing et transaction

Le parser ne dépend pas d'une seule mise en page fragile : variantes d'en-têtes connues,
validation des colonnes/unités, mapping par engine name, doublons/inconnus bloquants et diagnostic
brut borné. `not-applicable` χ² reste distinct de passed/failed. Un `.err` ou code retour ne suffit
pas seul : la présence et la cohérence des sorties attendues confirment l'achèvement.

En BTM réel, la publication est transactionnelle : résultats parsés + diagnostic minimal + état
du run + UPSERT des variables. Sans commit base réussi, le job n'est pas déclaré publié. Tous les
fichiers sont régénérables depuis le snapshot/version ; ils ne sont pas l'historique officiel.

## Recette native encore requise

La CI Linux valide générateurs, parsers et transport, mais ne contient ni STAR*NET ni licence. La
recette sur VM doit confirmer :

- aucun dialogue interactif sur les templates FR/UK/canonique ;
- timeout et deuxième run après succès/échec ;
- `.run/.lst/.pts/.err` et premier `.dmp` réel anonymisé ;
- comptes de points/résidus/dof et mapping exact ;
- comportement de licence et concurrence ;
- nettoyage des dossiers sans perte de diagnostic ;
- comparaison tolérée avec le preview Python sur les jeux propres et explication des différences
  de modèle (courbure, réfraction, pondération, arrondis, options natives).
