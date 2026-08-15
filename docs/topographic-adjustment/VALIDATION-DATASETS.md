# Catalogue de 100 jeux de validation topographiques

## Statut et usage

`public/demo-datasets/v1` contient 100 réseaux synthétiques déterministes générés à partir d'une
vérité 3D connue. Ce ne sont pas des mesures de chantier. Ils sont conçus pour la démonstration,
les tests de non-régression, la comparaison preview/STAR*NET et le mode aveugle de l'Analysis Lab.

Le catalogue remplace les futurs jeux inventés à la main. Les anciennes fixtures ATS34/ATS35/FR
restent temporairement dans `src/demo/fixtures` parce que l'application et des tests historiques
les utilisent encore ; elles sont des fixtures de compatibilité et ne doivent plus être étendues.

## Fichiers canoniques

- `manifest.json` : index léger, distribution, scénarios, tailles et SHA-256 des shards ;
- `schema.json` : contrat minimal public ;
- `shards/validation-001-010.json` … `validation-091-100.json` : dix jeux par shard ;
- `packages/python/topographic-adjustment-core/src/btm_topography/validation_catalogue.py` : seule
  source de génération ;
- `test_validation_catalogue.py` : contraintes géométriques, couverture, identité et
  reproductibilité.

Ne jamais demander à une IA de lire tous les shards. Lire le manifest, sélectionner un ID puis
charger uniquement son shard. Le jeu canonique pour les tests réseau propres est `BTM-VAL-041`
(trois stations, aucun défaut injecté).

## Couverture exacte

| Axe | Distribution |
|---|---|
| Stations | 20 jeux chacun avec 1, 2, 3, 4 et 5 stations |
| Cibles | maximum 30 par station, distances inclinées vraies de 3 à 100 m |
| Références | 3 à 6 par station |
| Shared points | 0 pour une station ; 2 à 6 confirmés explicitement pour un réseau |
| Composition | 80 scénarios isolés, 20 avec une anomalie secondaire |

| Scénario principal | Nombre |
|---|---:|
| propre | 12 |
| référence déplacée de 2–3 mm | 14 |
| vibration transitoire de station | 14 |
| erreur grossière Hz | 6 |
| erreur grossière Vz | 6 |
| erreur grossière Sd | 6 |
| correction atmosphérique omise | 12 |
| courbure/réfraction omise | 10 |
| distance horizontale interprétée comme inclinée | 10 |
| réduction Face I/Face II | 10 |

Chaque jeu contient trois époques : `baseline`, `incident`, `verification`. Les références
déplacées restent déplacées après l'incident : la correction attendue est de libérer ou mettre à
jour leur contrainte, pas de simuler un retour arbitraire. La vibration touche une série contiguë
de lignes de visée. Les erreurs grossières ciblent une composante. Les effets atmosphériques et de
courbure sont calculés physiquement aux distances du jeu, y compris quand leur amplitude reste
submillimétrique.

## Structure utile

Un dataset regroupe : conventions, époques, stations et orientations vraies, points physiques,
bindings station–cible, mappings shared confirmés, contraintes de références, setups mixtes,
coordonnées initiales approximatives, T/P, observations Face I/II, traces de correction et oracle.

Deux cas d'identité sont systématiquement représentés dans les réseaux :

- même point physique observé sous des noms différents, relié explicitement ;
- même nom métier (`MPO001` en FR ou `MP001` en UK) utilisé par plusieurs stations pour des points
  physiques distincts, jamais relié automatiquement.

`oracle` contient vérité, faute injectée et action attendue. L'UI le masque en mode aveugle. Les
tests peuvent l'utiliser directement. Les valeurs `truth` de chaque observation permettent de
séparer géométrie exacte, bruit déterministe et faute.

## Génération et vérification

```bash
PYTHONPATH=packages/python/topographic-adjustment-core/src \
python -m btm_topography.validation_catalogue generate \
  --output public/demo-datasets/v1

PYTHONPATH=packages/python/topographic-adjustment-core/src \
python -m btm_topography.validation_catalogue check \
  --output public/demo-datasets/v1
```

La graine PCG64, le timestamp du manifest, l'ordre JSON et le découpage sont fixes. `check` régénère
dans un dossier temporaire et compare chaque octet. Toute modification scientifique intentionnelle
incrémente `GENERATOR_VERSION`, régénère tous les shards et met à jour les tests.

## Intégration dans la maquette

Le prochain refactor doit :

1. charger le manifest sans importer les shards dans le bundle initial ;
2. proposer filtres stations/scénario/template/isolé-combiné et recherche par ID ;
3. charger un seul shard à la demande avec validation de schéma et état d'erreur ;
4. convertir le jeu choisi vers les contrats de repositories existants, sans contourner le
   resolver de configuration ;
5. offrir mode aveugle puis révélation de l'oracle ;
6. exécuter preview et, si configuré, STAR*NET sur le même snapshot ;
7. afficher comparaison aux attentes avec tolérances, pas une égalité textuelle fragile ;
8. garder `BTM-VAL-041` dans les tests golden d'initialisation/réseau/parité ;
9. ajouter des tests ciblés pour chaque famille de défaut plutôt que 100 E2E identiques.

L'intégration ne doit pas réécrire les moteurs déjà caractérisés. Si un dataset expose une
différence, ajouter d'abord un test minimal qui prouve le contrat avant de corriger le moteur.
