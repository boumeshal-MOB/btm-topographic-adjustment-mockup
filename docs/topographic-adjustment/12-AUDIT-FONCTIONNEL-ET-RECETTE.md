# Audit fonctionnel et recette de la maquette

## 1. Périmètre

Cette recette couvre le parcours réellement exploitable de la maquette :

- création d’un processing mono-station ou réseau connecté ;
- édition d’un processing existant sans modifier son historique ;
- initialisation, préparation et test d’un ajustement ;
- exécution manuelle du vrai STAR*NET 14 pendant la configuration ;
- activation/versionnement ;
- simulation des runs BTM, sorties stables, catch-up et recalcul ;
- administration et laboratoire d’analyse.

La maquette Vercel conserve un backend MSW et un moteur navigateur pour rester autonome. Le test
connecté STAR*NET valide les fichiers natifs et le contrat Windows, mais ne publie pas de mesures
dans une vraie base BTM.

## 2. Anomalies critiques corrigées

### Édition instable

Cause : deux composants possédaient chacun une copie du même draft et se synchronisaient par
polling. Un ancien draft local pouvait aussi manquer des tableaux attendus, provoquant
`Cannot read properties of undefined (reading 'filter')`.

Correction :

- un seul état React possède les neuf étapes ;
- **Edit processing** reconstruit toujours un draft propre depuis la version enregistrée ;
- la clé de stockage de la maquette est versionnée pour ne pas relire les formes incompatibles ;
- une erreur de route affiche une page de récupération, jamais une stack technique brute.

### Sélecteur de slot vide

Un processing créé inactif possède une version `draft`, donc aucun slot opérationnel. C’est une
règle correcte qui était présentée comme un contrôle cassé.

Correction :

- l’Administration explique clairement qu’aucune configuration n’est active ;
- elle ne montre pas de bouton de run trompeur ;
- le dernier slot disponible est sélectionné automatiquement dans Adjustment et sur un processing
  actif ;
- l’activation directe d’une version non testée est supprimée.

### Test STAR*NET au mauvais endroit

La connexion VM se trouvait dans le détail d’un run simulé, après publication.

Correction :

- le test du vrai STAR*NET est intégré à **Adjustment**, immédiatement après la préparation de
  l’époque ;
- le service reçoit exactement les fichiers affichés dans les aperçus ;
- URL et clé restent en mémoire de l’onglet uniquement ;
- **Run now with STAR*NET** reste désactivé jusqu’à réussite de **Test service** ;
- le résultat natif, la convergence, le χ² et les fichiers de sortie sont consultables sur place.

## 3. Règles de comportement vérifiables

- Un processing inactif peut être enregistré, mais il n’a ni run ni slot opérationnel.
- **Edit processing** ne réutilise jamais silencieusement un ancien brouillon incomplet.
- Une version de configuration utilisée reste immuable.
- Une version non active doit passer par l’éditeur, Adjustment et Review.
- Le test de configuration ne publie aucune variable BTM.
- Le bouton de run de l’Administration simule seulement l’orchestration BTM de la maquette.
- En production, le backend BTM appelle STAR*NET ; l’utilisateur ne saisit pas la clé.
- Chaque job Windows utilise un dossier aléatoire et isolé.
- La limite parallèle suit le nombre de licences, pas le nombre de dossiers.
- Les fichiers temporaires ne sont jamais la source de vérité.

## 4. Matrice de recette

### Création et édition

- [ ] Créer un processing mono-station et parcourir les neuf étapes.
- [ ] Créer un processing inactif et vérifier le message « No active configuration ».
- [ ] Ouvrir **Edit processing** et vérifier qu’aucune erreur React n’apparaît.
- [ ] Vérifier que stations, cibles, mappings et paramètres correspondent à la version choisie.
- [ ] Enregistrer une nouvelle version sans altérer les versions précédentes.

### Adjustment

- [ ] Vérifier que le dernier slot disponible est présélectionné.
- [ ] Préparer une époque et consulter diagnostic, `.dat` et `.snproj`.
- [ ] Vérifier qu’aucun slot affiche une explication exploitable, pas un champ vide.
- [ ] Tester l’URL et la clé du service Windows.
- [ ] Exécuter le job réel et obtenir `exitCode = 0`.
- [ ] Confirmer `Network Processing Completed`, convergence et statut χ².
- [ ] Consulter au moins le `.lst` et les sorties natives disponibles.
- [ ] Recharger la page et vérifier que la clé a disparu.

### Exploitation

- [ ] Activer une version testée et vérifier l’apparition des slots.
- [ ] Lancer un run manuel simulé et ouvrir son diagnostic.
- [ ] Vérifier la stabilité des identifiants de variables entre deux versions.
- [ ] Catch-up : remplacer le même `(variable_id, timestamp)`.
- [ ] Recalcul : sélectionner la version historiquement valide.
- [ ] Vérifier les états sans résultat, warning, failed et provisional.

### Réseau et scientifique

- [ ] Confirmer manuellement au moins deux points communs, trois recommandés.
- [ ] Refuser un réseau déconnecté.
- [ ] Calculer puis accepter les coordonnées initiales depuis la fenêtre médiane.
- [ ] Vérifier les corrections prisme/atmosphère sans double application.
- [ ] Vérifier résidus, χ², facteur de variance, sigmas et ellipses.

## 5. Tests automatisés obligatoires

```text
npm run typecheck
npm run lint
npm run test
npm run test:python
npm run build
npm run test:e2e
```

La CI Windows doit aussi compiler, tester et empaqueter le service STAR*NET. La seule vérification
non reproductible en CI publique reste l’exécution du binaire licencié sur la vraie VM.
