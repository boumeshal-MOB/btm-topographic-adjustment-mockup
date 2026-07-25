# Données de démonstration Vercel

## 1. Règle de séparation

Le classeur fourni sert uniquement à rendre la maquette Vercel réaliste. Il n'appartient pas au
parcours produit et ne définit pas le contrat de données BTM.

La maquette charge des fixtures via `DemoRepository`. Le futur produit charge les mêmes view
models via les API BTM.

## 2. Classeur ATS34 fourni

Fichier source : `ATS34 Raw Data, Lookup, Header (1).xlsx`.

### Contenu confirmé

| Feuille | Étendue | Données |
|---|---:|---|
| Raw Observations | A1:I6495 | 6 494 observations + notes |
| Lookup Table | A1:J44 | 43 mappings |
| Header | A1:I11 | station + 9 références |

### Observations

- station : `NTE_ATS34` uniquement ;
- 42 noms de cibles observés ;
- période : 2025-03-01T00:02:58Z → 2025-03-31T20:12:32Z ;
- colonnes métier : Timestamp, RecordNumber, RTS, Target, Hz, Vz, Sd ;
- deux colonnes supplémentaires servent aux notes et ne font pas partie du contrat brut ;
- Hz/Vz sont en degrés décimaux dans le classeur ;
- Sd est en mètres.

### Lookup

Colonnes : RTS, TargetName, AdjustmentName, OutputName, TargetHeight, PrismConstant, PrismType,
PrismGrade, AdjustmentEnabled, GraphEnabled.

Constantes réellement présentes dans les 43 lignes :

- 0 m ;
- 0,0089 m ;
- 0,0300 m.

La note mentionne aussi +26,5 mm pour Micro Prism, mais aucune ligne de cette fixture ne porte cette
valeur. Le catalogue UK peut la proposer sans prétendre qu'elle est utilisée dans ce dataset.

Les 43 lignes sont AdjustmentEnabled ; GraphEnabled est faux dans le classeur. Pour la démo, les
cibles publiées doivent être choisies explicitement par l'utilisateur ou par une configuration de
démo clairement documentée, pas en modifiant silencieusement le sens de la colonne.

### Header

- `NTE_ATS34` a E/N sigma 0,1 m et H libre `*` ;
- neuf références `L34RE1100_*` ont des sigmas de 1 à 2 mm ;
- `Used from cycle = 20241202_0200` ;
- le code `C` indique les lignes coordonnées destinées au header STAR*NET.

## 3. Conversion build-time

Conserver un script déterministe :

```text
Excel source
  → validation des trois feuilles/headers
  → normalisation dates/nombres
  → JSON versionné avec provenance
  → import par DemoRepository
```

Le JSON inclut :

- version de schéma ;
- nom/hash du fichier source ;
- date de conversion ;
- statistiques de contrôle ;
- rows normalisées ;
- warnings de données.

Le build échoue si les colonnes obligatoires ou compteurs attendus changent sans mise à jour du
fixture contract.

## 4. Présentation dans l'UI

Nom recommandé : `NTE ATS34 — UK supplied dataset (demo)`.

Afficher `Demo data` dans le header, puis agir comme si les observations avaient été lues depuis
BTM. Aucun bouton `Upload Excel`, `Choose file` ou drag-and-drop.

Une route développeur hors navigation peut montrer :

- source ;
- compteurs ;
- premières/dernières dates ;
- contrôles 78,4100 + 0,0089 ;
- reset de la démo.

## 5. Limite du dataset

Le classeur est mono-station. Il permet de tester :

- configuration UK ;
- Lookup/Header ;
- prismes et constantes ;
- références connues ;
- initialisation/ajustement mono-station ;
- génération `.dat` ;
- χ² et diagnostics.

À lui seul, il ne permet pas de tester authentiquement :

- points communs entre stations ;
- synchronisation :25/:26/:32 ;
- station manquante ;
- connectivité réseau ;
- changement de mapping multi-stations.

## 6. Seconde station UK cohérente

La fixture `NTE_ATS35` est synthétique, mais elle est construite dans le même système de
coordonnées que le Header ATS34 et sur une période qui recouvre le dernier jour ATS34.

Elle observe trois monuments physiquement identiques à des cibles ATS34 :

| Station ATS34 | Station ATS35 |
|---|---|
| `360_301_34` | `360_301_35` |
| `360_303_34` | `360_303_35` |
| `360_304_34` | `360_304_35` |

Les coordonnées communes sont obtenues par médiane des observations polaires ATS34 fournies,
après correction de constante, dans le datum du Header UK. Les observations ATS35 Hz/Vz/Sd sont
ensuite calculées depuis une seconde position de station et reçoivent un bruit déterministe
compatible avec les poids de la maquette. Les distances stockées restent brutes et exercent la
correction Leica −34,4 mm.

Les noms parallèles rendent les paires faciles à reconnaître, mais l'application ne les relie
jamais automatiquement. L'utilisateur doit toujours sélectionner au moins deux paires, lancer
l'analyse géométrique puis confirmer les propositions.

## 7. Fixture réseau synthétique séparée

Conserver ou reconstruire un dataset déterministe `Three-station network playground` uniquement
pour les scénarios réseau. Il est clairement étiqueté `Synthetic demo`.

Il couvre :

- trois stations avec époques décalées ;
- points réellement partagés connus du générateur mais non confirmés dans un nouveau draft ;
- noms homonymes représentant des points distincts ;
- station manquante puis donnée tardive ;
- T/P tardives ;
- mauvaise observation ;
- changement de références/version ;
- cible mono-rayon.

Le générateur peut connaître la vérité terrain pour vérifier les tests, mais l'UI doit suivre le
même workflow de confirmation que le produit.

## 8. Scénarios Vercel proposés

| Scénario | Dataset | Résultat attendu |
|---|---|---|
| UK single station | ATS34 fourni | configuration/ajustement réalistes |
| UK two-station network | ATS34 fourni + ATS35 cohérente | 3 vrais points communs proposés après 2 seeds |
| France corrected | petite fixture FR | aucune double correction |
| Mixed targets | synthétique mono-station | Prism/Sheet/Reflectorless |
| Common points | synthétique réseau | 2 seeds weak, 3 seeds robust |
| Sync | synthétique réseau | :25/:26/:32 → :30 |
| Missing station | synthétique réseau | reused → provisional |
| Catch-up | synthétique réseau | UPSERT du même slot |
| Bad observation | synthétique | χ² fail puis Auto Adjust |
| Historical version | synthétique | config par slot |

## 9. Moteur de démonstration

Le solveur local existant peut être réutilisé derrière `DemoAdjustmentEngine`. Il doit :

- fonctionner dans Web Worker ;
- ne pas bloquer l'UI ;
- utiliser les mêmes inputs résolus que le futur gateway ;
- retourner un diagnostic compatible avec les écrans ;
- afficher `Demo solver — not STAR*NET production result` dans les détails ;
- ne pas ajouter ses paramètres internes dans le modèle de configuration STAR*NET.

## 10. Persistance de démo

IndexedDB/localStorage peut sauvegarder drafts, versions et runs de démonstration. Le repository
doit simuler les invariants production : immutabilité, intervalle de validité, variables stables et
UPSERT unique. Un reset revient au seed sans toucher au fichier source.
