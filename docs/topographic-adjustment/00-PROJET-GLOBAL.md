# Projet global — BTM Topographic Adjustment Processing

## 1. Objectif

Créer une nouvelle maquette moderne, interactive et testable du futur processing
`Topographic Adjustment` de BlueTrust Monitoring, puis permettre à un développeur BTM de
reprendre les composants, formulaires, schémas, règles et fonctions métier sans tout redévelopper.

Le produit final remplace l'orchestration utile de StarAdjust legacy :

`données BTM → construction d'une époque → fichiers STAR*NET → ajustement → parsing natif → mesures BTM`

La maquette Vercel valide l'expérience utilisateur et les règles. La production exécute
STAR*NET Ultimate sur un serveur Windows dédié.

## 2. Résultats attendus

La solution doit permettre :

- de créer un processing pour une station totale ou un réseau connecté de plusieurs stations ;
- de sélectionner stations, cibles, références et variables brutes déjà présentes dans BTM ;
- de configurer l'instrument, chaque configuration de mesure et les corrections ;
- de gérer les mêmes points physiques observés sous différents identifiants BTM ;
- de calculer ou saisir les coordonnées initiales ;
- de configurer l'ajustement STAR*NET, le run, la synchronisation et les sorties ;
- de tester une époque avant activation ;
- de superviser les runs, diagnostiquer un échec et recalculer une période ;
- de créer une nouvelle version de configuration sans casser l'historique ;
- de publier une seule valeur finale par variable et timestamp.

## 3. Périmètre

### Inclus

- frontend complet de création et d'administration ;
- modèles et règles métier réutilisables ;
- données ATS34 préchargées pour la démonstration ;
- moteur de moindres carrés local uniquement comme adaptateur de démonstration ;
- simulation du backend BTM avec MSW ;
- calcul des coordonnées initiales et assistant de points communs ;
- templates FR et UK ;
- génération prévisualisable d'un `.dat` et d'une configuration STAR*NET ;
- Analysis Lab, contrôles qualité, ellipses et résidus ;
- versionnement des configurations et reprocessing.

### Hors périmètre de la maquette

- exécution réelle de STAR*NET dans Vercel ;
- import Excel visible dans le parcours utilisateur ;
- écriture dans une vraie base BTM ;
- déploiement du service Windows ;
- usage des fichiers custom générés par les scripts batch legacy comme contrat de production ;
- prise en charge d'un deuxième moteur d'ajustement.

## 4. Deux environnements, un même domaine

| Sujet | Maquette Vercel | BTM réel |
|---|---|---|
| Données | fixtures JSON préchargées | `raw_data` et métadonnées BTM |
| API | MSW + repository en mémoire/IndexedDB | Fastify TypeScript + PostgreSQL/TimescaleDB |
| Calcul de démonstration | moindres carrés locaux dans Web Worker | STAR*NET Ultimate sur Windows |
| Fichiers | prévisualisation générée en mémoire | dossier temporaire isolé par run |
| Résultats | état de démo | UPSERT dans `measures` |
| Configurations | repository de démo | versions immuables en base |
| Source de vérité | fixture + état local | base BTM |

Le domaine doit être découplé par interfaces afin de remplacer les adaptateurs sans réécrire les
écrans.

## 5. Workflow utilisateur compact

Le wizard contient neuf étapes :

1. **General** — nom, description, station unique/réseau, template pays, activation.
2. **Stations** — sélection parmi les stations disponibles dans BTM.
3. **Instruments** — modèle, hauteur, politique atmosphérique et résumé des mesures.
4. **Targets & Measurements** — cibles, rôles, corrections, poids, points physiques communs.
5. **Initialisation** — coordonnées connues ou station ancre locale, fenêtre de données et médianes.
6. **Adjustment** — paramètres STAR*NET, χ², ellipses, poids et Auto Adjust.
7. **Run** — event-driven/planifié, synchronisation, réutilisation, provisoire et catch-up.
8. **Output** — grille de publication et variables stables.
9. **Review & Create** — synthèse, validations, test d'une époque, création/activation.

Le projet BTM est implicite dans la navigation. L'utilisateur ne choisit pas un niveau
`standard/expert` : toutes les pages sont compactes et disposent d'options avancées.

## 6. Concepts temporels

Trois temps ne doivent jamais être confondus :

| Concept | Définition |
|---|---|
| Observation epoch | timestamp réel de la donnée d'une station dans BTM |
| Output slot | timestamp de publication aligné, par exemple `00/30` |
| Configuration validity | période `[validFrom, validTo[` pendant laquelle une version s'applique |

La fenêtre d'observations utilisée pour calculer les coordonnées initiales est une provenance de
calcul. Elle ne définit pas la validité des coordonnées ; celles-ci appartiennent à la version de
configuration.

## 7. Construction d'un run

1. Déterminer le slot de sortie à produire.
2. Résoudre la version de configuration valide pour ce slot.
3. Sélectionner une époque par station dans la tolérance de synchronisation.
4. Si une station n'a rien émis, réutiliser éventuellement son dernier cycle dans l'âge maximal.
5. Marquer le résultat provisoire dès qu'une donnée réutilisée ou une politique de fallback le requiert.
6. Résoudre les configurations de mesure, corrections et poids observation par observation.
7. Générer `.dat` et `.snproj` dans un dossier temporaire isolé.
8. Exécuter STAR*NET Ultimate et éventuellement Auto Adjust.
9. Parser les sorties natives et contrôler la qualité.
10. UPSERT les valeurs dans les variables BTM stables.
11. Enregistrer un journal de run minimal et supprimer le dossier temporaire après succès d'ingestion.

## 8. Station unique ou réseau

- **Single station** : une seule station et ses références/cibles. Aucun écran de points communs.
- **Network** : plusieurs stations qui forment un réseau topographique connecté par des points
  physiques communs, des références communes ou des relations géométriques suffisantes.
- Plusieurs stations éloignées et indépendantes doivent être créées comme plusieurs processings.

La connectivité graphique est un précontrôle. L'observabilité/rang du système reste le contrôle
mathématique final.

## 9. Points physiques

Chaque cible/prisme BTM possède son propre identifiant et reste distinct par défaut. Deux noms
identiques ne prouvent rien. Un `PhysicalPoint` représente l'identité topographique réelle et peut
regrouper plusieurs cibles BTM après confirmation.

Pour un nouveau réseau sans coordonnées globales :

- l'utilisateur fournit au moins deux correspondances certaines si l'orientation relative est inconnue ;
- trois points bien distribués sont recommandés pour obtenir de la redondance ;
- l'application calcule une transformation provisoire entre nuages locaux ;
- `Check common points` propose des candidats avec résidus H/V/3D ;
- l'utilisateur confirme ou rejette ; aucune liaison n'est automatique.

Une distance ou un vecteur connu relie deux points distincts : il ne les fusionne jamais.

## 10. Coordonnées initiales

Pour un nouveau processing, le mode par défaut est `No coordinates — fix one station` :

- station ancre ;
- E/N/H/orientation, avec `0/0/0/0` autorisé pour un repère local ;
- fenêtre d'observations servant au calcul ;
- médiane de Hz, Vz et Sd corrigée pour chaque `station × cible` ;
- taux de points disponibles et liste des absents ;
- dispersion des estimations multi-stations.

L'autre mode, `Use known reference coordinates`, permet la saisie, le collage ou l'import CSV
d'un format imposé pour les coordonnées de référence. Il n'importe jamais de données brutes.

## 11. Instruments et mesures

Une station peut mélanger prismes, feuilles réfléchissantes et laser sans réflecteur. Le mode EDM,
la constante et le poids appartiennent donc à la configuration `station × cible` ou à
l'observation si BTM possède cette métadonnée. Ils ne sont pas globaux à l'instrument.

La station conserve uniquement son modèle, sa hauteur, ses capacités, sa politique atmosphérique
et un fallback optionnel.

## 12. Corrections

La distance stockée est une distance inclinée. La chaîne résolue est :

1. constante de réflecteur différentielle ;
2. correction atmosphérique EDM éventuelle ;
3. distance inclinée finale écrite dans le `.dat` ;
4. facteur de grille/datum horizontal séparé via la logique STAR*NET appropriée.

Règle : `deltaPrism = constante requise − constante déjà appliquée`.

`.SCALE` STAR*NET agit sur la distance horizontale ou la composante horizontale d'une distance
inclinée dans un projet local. Il ne représente pas la correction atmosphérique EDM complète.
Le coefficient de réfraction STAR*NET corrige la géométrie des angles zénithaux ; il ne remplace
pas non plus la correction T/P de la distance.

## 13. Templates initiaux

- **France** : Topcon MS05AXII proposé, distances considérées déjà corrigées, `MPO FR`
  requise/appliquée `+25,5 mm`, donc delta BTM `0,0 mm`, angles en gons.
- **UK** : Leica TM50 I et paramètres du projet HS2/NTE fourni, distances brutes enregistrées
  avec constante terrain `0,0 mm`, corrections cible `0 / +8,9 / +26,5 / +30,0 mm`, angles DMS.

Ces valeurs sont des presets versionnés, pas des normes nationales. Aucun point physique commun
n'est créé par un template.

## 14. Run et synchronisation

Le mode par défaut est event-driven :

- station unique : nouvelle époque exploitable ;
- réseau : nouvelle époque de chaque station requise, dans la tolérance configurée ;
- mode planifié toutes les X minutes disponible ;
- réutilisation de la dernière époque pendant 30, 45 ou 60 minutes configurable ;
- résultat provisoire si réutilisation/fallback ;
- catch-up optionnel lors de l'arrivée tardive de la vraie observation ou de T/P ;
- publication indépendante, par exemple toutes les 30 minutes à `:00/:30`.

## 15. Qualité et Auto Adjust

Le run expose au minimum : convergence, rang, degrés de liberté, χ² bilatéral, facteur de
variance, résidus standardisés, références présentes, disponibilité des cibles, incertitudes et
ellipses de confiance.

Si le χ² est invalide, l'utilisateur choisit une politique :

- bloquer la publication ;
- publier avec statut d'échec si explicitement autorisé ;
- lancer Auto Adjust STAR*NET Ultimate avec garde-fous ;
- ouvrir le cas dans Analysis Lab.

Auto Adjust exclut des observations du calcul, jamais des lignes de `raw_data`. Chaque tentative
et exclusion est tracée dans le diagnostic du run.

## 16. Sorties BTM

Les variables appartiennent au processing et restent stables à travers ses versions.

Par prisme/cible publiable : `Adjusted X/Y/Z`, `Delta X/Y/Z`, `Sigma X/Y/Z`.

Globales au processing : `Chi2 Passed`, `Variance Factor`, `References Available`,
`Target Availability`, et éventuellement `Provisional Flag`/`Quality Code` numériques.

`Delta X/Y/Z` représente la différence entre la coordonnée ajustée et la coordonnée initiale de
la version utilisée.

Un recalcul réutilise les mêmes `variable_id` et remplace la valeur du même timestamp par UPSERT.
Il ne crée ni nouvelle variable ni résultat concurrent dans `measures`.

## 17. Versionnement

Un processing contient plusieurs versions de configuration. Une version utilisée est immuable.

- `draft` : éditable, jamais exécutée ;
- `active` : version courante pour les nouveaux slots ;
- `archived` : historique immuable, toujours utilisable pour un recalcul de sa période.

Le recalcul historique utilise par défaut la version valide à chaque slot. Une version forcée sur
une plage est une option avancée, accompagnée d'un aperçu et d'une justification.

## 18. Administration et Analysis Lab

L'administration comporte : Overview, Configurations, Measurement Setup, Point Identity,
Initialisation, Adjustment, Run, Output, Runs, Reprocessing, Analysis et Audit.

Analysis Lab permet de charger une époque, afficher réseau/résidus/ellipses, modifier des poids,
références ou exclusions, relancer des trials et sauvegarder le trial retenu comme nouvelle
version de configuration avec justification. Les essais ne modifient jamais la configuration active.

## 19. Critères UX globaux

- un utilisateur non spécialiste peut créer un cas standard avec les presets ;
- les informations expertes sont disponibles sans être imposées ;
- aucune action importante n'est cachée par un rôle supposé ;
- les corrections et fallbacks sont expliqués en langage métier ;
- les unités sont toujours visibles dans les en-têtes/labels ;
- toute erreur indique quoi corriger et où ;
- les tables sont compactes, filtrables, éditables en lot et accessibles au clavier ;
- tous les boutons de la maquette ont un comportement réel ;
- aucune donnée de démonstration n'est présentée comme une donnée BTM réelle.

