# Frontend — wizard étapes 1 à 3

## Étape 1 — General

### But

Identifier le processing et choisir le cas topographique sans demander d'information déjà connue
du contexte BTM.

### Vue compacte

| Champ | Règle |
|---|---|
| Processing type | lecture seule : `Topographic Adjustment` |
| Processing name | obligatoire, unique dans le projet selon règle BTM |
| Description | optionnelle |
| Adjustment scope | `Single station` ou `Network` |
| Site | seulement si le projet contient plusieurs sites pertinents |
| Country preset | France ou United Kingdom |
| Configuration valid from | validité de la première version, indépendante des données d'initialisation |
| Activate after creation | désactivé par défaut si `Test one epoch` n'a pas réussi |

Ne pas afficher de sélecteur Project : l'utilisateur est déjà dans le projet.

### Résumé des données BTM

Afficher sous forme de chips/KPI compacts, et non une grande fiche :

- période des observations ;
- dernière observation ;
- nombre de lignes brutes ;
- nombre de cibles ;
- variables disponibles : Hz, Vz, Sd, T, P ;
- qualité des métadonnées.

Ces informations remplacent le bloc détaillé qui se trouvait auparavant dans la page réseau.

### Effet du preset

Le changement France/UK propose un diff des valeurs qui seront préremplies. Il ne crée pas de
station, cible, point commun ou coordonnée.

## Étape 2 — Stations

### But

Sélectionner une station ou les stations d'un même réseau parmi celles disponibles dans BTM.

### Tableau unique

Colonnes :

- sélection ;
- station ;
- dernière observation ;
- cibles observées ;
- cycle estimé ;
- données environnementales ;
- readiness ;
- configuration précédente disponible.

Ne pas répéter Project, Site, Network type, période, nombre d'observations ou liste de variables.

### Règles

- Single station : exactement une ligne.
- Network : deux stations ou plus.
- Les stations sélectionnées doivent appartenir au même projet et à une zone/réseau pouvant être
  ajusté ensemble.
- L'application ne propose pas de traiter plusieurs groupes indépendants dans le même processing.
- Si un mapping/version existant couvre les mêmes stations, proposer `Reuse previous setup` avec
  diff et provenance.
- N'ajouter aucune cible nouvelle silencieusement : elle sera examinée à l'étape 4.

### Résumé après sélection

Exemples :

```text
3 stations selected · 128 targets · 2 prior configurations available
58 target setups reusable · 8 new targets to review
```

## Étape 3 — Instruments

### But

Configurer uniquement les propriétés communes à chaque station et la politique atmosphérique.

### Carte compacte par station

| Champ | Comportement |
|---|---|
| Instrument template | Topcon/Leica proposé par preset, modifiable |
| Instrument height (m) | axe des tourillons ; valeur 0 autorisée pour station permanente |
| Atmospheric correction | résumé du mode choisi |
| Measurements summary | compteur Prism / Sheet / Reflectorless / Unknown |
| Data coverage | Hz/Vz/Sd présents, T/P disponibles ou non |

Ne pas afficher un `EDM mode` global dans la vue standard. Le mode EDM est résolu au niveau
`station × cible` ou observation.

### Correction atmosphérique

Proposer quatre options :

#### A. Already applied by station

- BTM n'applique aucune correction EDM atmosphérique ;
- afficher la source de cette déclaration ;
- conserver le coefficient de réfraction STAR*NET séparément dans Adjustment.

#### B. BTM — cycle temperature and pressure

- sélecteur variable Temperature ;
- sélecteur variable Pressure ;
- tolérance temporelle en minutes ;
- formule/version dans `Show formula` ;
- aperçu sur une observation représentative.

Les listes montrent uniquement les variables compatibles disponibles dans BTM. Ne pas sélectionner
par nom automatiquement ; une proposition par métadonnée est autorisée et doit rester confirmable.

#### C. BTM — fixed temperature and pressure

- température fixe en °C ;
- pression fixe en hPa ;
- formule/version ;
- texte indiquant que les mêmes valeurs seront utilisées pour tous les cycles de la version.

#### D. No atmospheric correction

- distance utilisée sans correction atmosphérique ;
- avertissement informatif, pas erreur automatique ;
- justification requise à l'activation si le preset attend normalement une correction.

### T/P absentes ou invalides

Ce comportement est séparé du mode principal :

- `Wait / fail this slot` ;
- `Use fixed fallback T/P` ;
- `Continue without atmospheric correction` ;
- `Assume distance already corrected`.

Le choix précise si le résultat est provisoire et si un catch-up doit être déclenché à l'arrivée
des valeurs réelles.

### Options avancées station

- configuration de mesure par défaut comme fallback ;
- validation des plages T/P ;
- modèle/formule atmosphérique et version ;
- constante temporelle/tolérance de recherche ;
- capacités de l'instrument et modes EDM supportés ;
- erreurs de centrage proposées par le template.

Le mot `profile` ne doit pas apparaître dans l'UI. Utiliser `Instrument template` et
`Measurement setup`.

### Validations

Bloquantes :

- instrument absent ;
- variable T/P incompatible avec le mode cycle ;
- valeur fixe hors plage de validation ;
- politique manquante.

Avertissements :

- hauteur instrument 0 sur une station non déclarée permanente ;
- fallback station utilisé pour plusieurs cibles ;
- T/P trop anciennes pour le cycle ;
- mode de correction en conflit avec l'état déclaré des distances.

## Prompt ciblé

> Implémente les étapes General, Stations et Instruments conformément à ce document. Utilise des
> formulaires Zod, des cartes compactes, un tableau de stations et un drawer avancé. Le projet est
> implicite. Le type Single station/Network est dans General. Stations ne contient que la sélection
> des stations BTM. Supprime tout EDM global standard et implémente les quatre politiques
> atmosphériques avec un comportement séparé en cas de T/P absentes. Ajoute MSW, fixtures UK/FR,
> tests des changements de preset et validations de navigation.

