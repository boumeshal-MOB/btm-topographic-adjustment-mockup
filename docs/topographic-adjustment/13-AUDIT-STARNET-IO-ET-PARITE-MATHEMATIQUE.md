# Audit STAR*NET I/O et parité mathématique — 2026-08-08

## Verdict

Le défaut `Project Options File / Data line too long` est expliqué et corrigé : le
`project.snproj` transmis était structurellement cohérent, mais entièrement sérialisé avec des
fins de ligne Unix `LF`. Le lecteur historique d'options STAR*NET 14 pouvait donc le voir comme
une seule ligne de 2 655 octets et ouvrir une boîte de dialogue bloquante pendant le `/RUN`.

Les moteurs TypeScript et Python donnent les mêmes résultats sur les modèles qu'ils partagent.
Ils restent volontairement des moteurs d'aperçu euclidiens. Sur le jeu UK réel, leur résultat ne
doit pas remplacer STAR*NET : l'écart atteint quelques millimètres parce que STAR*NET applique en
plus ses réductions de courbure, réfraction et datum/échelle.

## 1. Diagnostic du fichier transmis

| Fichier | Octets | CRLF | LF isolés | Plus longue ligne vue par un lecteur CRLF |
|---|---:|---:|---:|---:|
| `project.snproj` transmis | 2 655 | 0 | 81 | 2 655 |
| `HS2_S1_NTE.snproj` natif fourni | 10 944 | 329 | 0 | 60 |
| `HS2_S1_NTE.prj` natif fourni | 6 737 | 200 | 0 | 50 |

Les sections et clés principales du fichier transmis étaient valides. La différence décisive
était le séparateur de lignes, pas la longueur logique des clés : chacune faisait au plus 53
caractères après découpage LF.

Correction appliquée à deux niveaux :

1. le générateur TypeScript produit directement de l'ASCII-compatible `CRLF`, avec une fin de
   ligne finale ;
2. le lanceur PowerShell renormalise défensivement `.dat` et `.snproj` en `CRLF` juste avant leur
   écriture ASCII sur la VM.

## 2. Audit des générateurs `.dat` et `.snproj`

### Corrigé

- commentaires nettoyés et bornés pour empêcher une injection de commande inline ;
- nombres non finis, distances nulles/négatives, noms moteur invalides et doublons rejetés ;
- un jeu de directions doit avoir au moins deux directions ;
- une orientation locale fixe est matérialisée par un backsight auxiliaire fixe cohérent ;
- deux orientations fixes contradictoires d'une même station sont rejetées ;
- `.SCALE` reste un facteur de datum et n'est jamais utilisé comme correction atmosphérique ;
- les distances inclinées écrites sont les distances finales déjà corrigées ; `.PRISM` n'est pas
  réappliqué ;
- `.EDM ADDITIVE` est explicite par défaut ; `PROPAGATE` reste une option avancée versionnée ;
- les erreurs Hz/Sd/Vz par visée incluent le centrage une seule fois ;
- `edm_ppm` du projet reste un fallback réel pour les lignes sans poids explicite ;
- les sigmas canoniques en secondes d'arc sont convertis en milligons pour un projet GONS
  (`1 mgon = 3,24 arcsec`) ;
- le `.snproj` demande `.pts`, `.dmp`, standard deviations, ellipses, résidus et convergence.

### Vérification UK des poids

Pour la visée UK de 78,4189 m, avec les valeurs fournies (direction 2,5 arcsec, zénith 1,5
arcsec, EDM 1 mm + 1 ppm, centrages 0,8/0,8/0,5 mm), le calcul BTM reproduit les colonnes du
listing STAR*NET après arrondi :

| Composante | BTM | Listing natif |
|---|---:|---:|
| Direction | ≈ 3,89 arcsec | 3,89 arcsec |
| Distance | ≈ 0,0016 m | 0,0016 m |
| Zénith | ≈ 2,39 arcsec | 2,39 arcsec |

Le mode EDM antérieur en racine de somme des carrés ne reproduisait pas le comportement STAR*NET
par défaut. Le manuel fourni confirme la combinaison additive et précise que des poids explicites
ne reçoivent pas une seconde fois les erreurs de centrage sans `.ADDCENTERING ON`. Le contrôle a
ensuite été étendu aux 42 visées du fichier UK : les 42 erreurs de distance et les 42 erreurs de
zénith reproduisent exactement les valeurs arrondies du listing ; les directions sont toutes à
moins de `0,01 arcsec`, l'écart d'arrondi restant venant de la géométrie ajustée utilisée dans le
listing.

## 3. Audit des lecteurs natifs

Le lecteur unifié traite maintenant :

| Sortie | Utilisation |
|---|---|
| `.run` | bitmask machine : avertissements, échec χ², non-convergence, licence, projet, démarrage |
| `.lst` | itérations, rang implicite, comptes, degrés de liberté, SSR pondérée, facteur, χ², coordonnées, sigmas, ellipses et résidus |
| `.dmp` | coordonnées et sigmas pleine précision, colonnes identifiées par leur en-tête |
| `.pts` | coordonnées complètes lorsque le DMP est absent |
| `.err` | avertissements séparés des erreurs fatales connues |

Règles ajoutées :

- priorité `.dmp` puis `.pts` puis `.lst` pour les coordonnées ;
- enrichissement des coordonnées pleines avec les sigmas/ellipses du listing ;
- conversion des résidus GONS/milligons vers l'unité canonique arcsec ;
- prise en charge du caractère SUB et du footer natif du listing ;
- rejet d'un nom de coordonnée dupliqué ;
- les noms tronqués du `.lst` sont marqués comme tels et ne doivent pas piloter seuls le mapping.

### Essai sur les sorties UK réelles fournies

| Indicateur parsé | Résultat |
|---|---:|
| Exécution terminée / convergée | oui / oui |
| Itérations | 2 |
| Stations | 43 |
| Observations STAR*NET | 155 |
| Inconnues | 130 |
| Degrés de liberté | 25 |
| Somme pondérée des carrés | 24,837 |
| Facteur d'erreur total | 0,997 |
| Test χ² | passé |
| Coordonnées complètes | 43 |
| Résidus Hz/Vz/Sd | 126 |
| Avertissements / erreurs fatales | 2 / 0 |

Les 155 observations STAR*NET comprennent ici 126 composantes de mesures (42 × Hz/Vz/Sd) et 29
contraintes de coordonnées. Le nombre de résidus de mesures lu est donc cohérent.

## 4. Parité TypeScript ↔ Python

Les deux moteurs utilisent la même convention E/N/H, `atan2(ΔE, ΔN)`, Hz/Vz en radians, Vz
zénithal, HI/HT, sigmas finaux et résidus pondérés.

### Vecteur canonique bruité

| Résultat | TypeScript | Python | Écart observé dans les tests |
|---|---:|---:|---:|
| E (m) | 10,000020469177025 | 10,000020469177025 | < 10⁻¹² m |
| N (m) | 20,000024271664387 | 20,000024271664387 | < 10⁻¹² m |
| H (m) | 5,000014727500164 | 5,000014727500164 | < 10⁻¹² m |
| σE (m) | 0,000258196136097459 | 0,000258196136097459 | < 10⁻¹⁵ m |
| SSR pondérée | 0,443754922811899 | 0,443754922811899 | < 10⁻¹² |

### Réseau et initialisation

- le réseau 3D synthétique à deux stations récupère toutes les coordonnées vraies à moins de
  `10⁻⁶ m` et l'orientation de la deuxième station à moins de `10⁻⁷ rad` dans les deux moteurs ;
- l'initialisation réseau commune récupère la station `(50, 5, 1)` et son orientation `0,3 rad`
  avec les mêmes tolérances ;
- la résection TypeScript a été alignée sur Python : ajustement conjoint E/N/H/orientation avec
  Hz, Vz et Sd, plutôt qu'une intersection 2D suivie d'une hauteur moyenne ;
- les deux frontières rejettent désormais les identifiants dupliqués, sigmas nuls, valeurs non
  finies, stations inconnues et distances non physiques.

## 5. Comparaison Python preview ↔ STAR*NET UK réel

Le même `.dat` UK et les mêmes contraintes donnent exactement les mêmes dimensions de système :
43 points, 126 composantes de mesure, 29 contraintes, 130 inconnues et 25 degrés de liberté.

| Indicateur | Python euclidien, données DAT | STAR*NET natif |
|---|---:|---:|
| SSR pondérée | 39,962430 | 24,837 |
| Facteur d'erreur | 1,264317 | 0,997 |
| χ² à 5 % | passé | passé |

Écarts de coordonnées Python moins `.pts` STAR*NET :

| Composante | RMS | Maximum absolu |
|---|---:|---:|
| E | 2,185 mm | 6,923 mm |
| N | 1,733 mm | 5,914 mm |
| H | 1,801 mm | 4,753 mm |

Ce résultat n'indique pas une divergence TypeScript/Python. Il mesure deux modèles différents :

- le preview résout une géométrie locale rectiligne ;
- STAR*NET applique son modèle certifié, notamment `.SCALE 0.999986506621139`, rayon terrestre
  6 372 000 m, réfraction 0,07 et ses conventions de réduction/itération.

Conséquence : le preview est adapté au contrôle de formulaire, au laboratoire, à l'initialisation
et au diagnostic. Les coordonnées publiées de production doivent rester celles de STAR*NET.

## 6. Limites restantes et prochaine recette VM

### À valider sur la VM

1. redéployer cette version et relancer le même job ;
2. confirmer qu'aucune fenêtre `Data line too long` ne s'ouvre ;
3. vérifier la présence de `.run`, `.lst`, `.pts`, `.dmp` et `.err` ;
4. confirmer les 43 coordonnées, 126 résidus, 25 degrés de liberté et χ² ;
5. transmettre uniquement les sorties non sensibles si une comparaison finale est nécessaire.

La CI Linux ne contient ni STAR*NET ni sa licence. Elle vérifie le générateur, le protocole et les
parsers, mais ne peut pas remplacer cette recette native.

### Validation locale exécutée

- TypeScript : typecheck et lint réussis, `254/254` tests Vitest réussis ;
- Python/Lambda : `23/23` tests du noyau et `5/5` tests du contrat Lambda réussis ;
- build Vite de production réussi ;
- les sept scénarios Playwright n'ont pas pu démarrer localement faute de binaire Chromium dans
  le conteneur de travail ; aucun scénario n'a atteint l'application. La CI GitHub installe
  explicitement Chromium avant cette étape et reste la validation E2E de référence.

### Éléments explicitement hors parité actuelle

- `geometricRelationships` existe dans le contrat de configuration mais la maquette ne permet pas
  encore de le saisir ni de le matérialiser dans le `.dat` ; le moteur TypeScript sait traiter
  plusieurs contraintes géométriques, pas encore toute la chaîne Python/STAR*NET ;
- le détail des observations supprimées par l'Auto Adjust natif n'est pas encore extrait vers un
  contrat structuré ; le listing reste consultable ;
- les en-têtes DMP de sigmas sont couverts par des alias et des tests synthétiques, mais le projet
  UK fourni ne créait pas de DMP. Le premier DMP STAR*NET 14 réel généré doit être conservé comme
  fixture anonymisée de test ;
- la publication transactionnelle vers les vraies variables BTM appartient à l'intégration
  backend, pas à la maquette Vercel.

## 7. Références de contrôle

- manuel STAR*NET fourni, chapitres 4, 5, 9 et annexe B ;
- [MicroSurvey — Command-Line Interface with STAR*NET Ultimate](https://helpdesk.microsurvey.com/article/1367-command-line-interface-with-star-net-ultimate) ;
- [MicroSurvey — Summary of STAR*NET input data types and inline options](https://helpdesk.microsurvey.com/en-us/article/1120-summary-of-star-net-input-data-types-and-inline-options) ;
- [MicroSurvey — Company or Project Options File Has Errors](https://helpdesk.microsurvey.com/article/1446-company-or-project-options-file-has-errors).
