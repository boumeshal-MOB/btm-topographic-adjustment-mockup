# Sources examinées et décisions retenues

Ce document indique comment les éléments fournis ont été utilisés. Il évite à une IA ou à un
développeur de réintroduire une hypothèse abandonnée parce qu'elle apparaît dans un ancien fichier.

## 1. Sources topographiques et legacy

| Source | Usage retenu | Ne pas en déduire |
|---|---|---|
| Manuel de référence STAR*NET fourni | syntaxe `.dat`, options projet, poids, contraintes, sorties et principes d'ajustement | architecture BTM ou UX |
| `.prj/.snproj` HS2/NTE fournis | valeurs exactes du preset UK STAR*NET | norme UK générale |
| `.dat`, `.pts`, `.err` fournis | exemples d'entrée et de sorties natives, noms et parsing | contrat des exports batch custom |
| `argus_export` / `chisquare_export` | compréhension du résultat legacy uniquement | format de production cible |
| Classeur ATS34 Raw Data/Lookup/Header | fixture Vercel UK, observations, lookup, constantes et coordonnées de démo | preuve d'un réseau multi-stations ou import utilisateur |
| Emails/contextes fournis | besoins historiques : correction atmosphérique, lookup, génération et outputs | confusion legacy entre `.SCALE` et correction EDM |
| Transcription `StarNet.docx` | validation du besoin utilisateur, simplification et analyse d'une époque | règle mathématique si contredite par le manuel/calcul |
| `config.cfg` France | contexte historique : 3D locale, gons, 30 itérations, confiance 95 % | paramètres Huber/VCE/CoMeT dans STAR*NET |
| Documentation Topcon MS05AXII | capacités et précisions Prism/Sheet/Reflectorless proposées au preset FR | poids définitifs d'un chantier sans validation géomètre |

## 2. Sources architecture BTM

| Source | Décision appliquée |
|---|---|
| `BTM-Architecture-for-Prototype.md` | `treatments`, variables rattachées au processing, `raw_data`, `measures`, TimescaleDB, projet implicite |
| ADR-0001 | nouvelle API sous Fastify TypeScript/Zod, Express conservé sans nouvelle route |
| ADR-0002 | strangler frontend, MUI 5, Router v6, TanStack Query v5, RHF/Zod, runtime React 17/types 18 |
| ADR-0008 | écriture atomique de l'arbre complet d'une configuration |
| ADR-0010 | MSW partagé par Vitest/Playwright et seconde piste E2E Fastify/PostgreSQL |
| ADR-0011 | namespace react-i18next de feature, locale pilotée par le Redux existant |
| ADR alertes/outbox/idempotence | source d'inspiration pour jobs idempotents et écritures atomiques, sans copier le domaine alertes |
| ADR Lambda/build | non applicable au moteur : décision produit explicite d'un serveur Windows STAR*NET dédié |

L'ancien document d'architecture proposait une Lambda/S3 comme modèle habituel de processing.
Cette hypothèse est explicitement remplacée ici pour `Topographic Adjustment` par un service
Windows et PostgreSQL/TimescaleDB comme source de vérité.

## 3. Décisions issues des ateliers produit

Les décisions suivantes priment sur les exemples historiques :

- nouveau type, pas de réutilisation `Theodolite` ;
- STAR*NET Ultimate seul moteur de production ;
- une station ou un réseau connecté par processing ;
- mapping explicite des variables et points physiques, versionné ;
- aucune identité physique automatique depuis les noms ;
- initialisation locale par défaut et médianes sur une fenêtre choisie ;
- EDM/constante/poids par observation ou `station × cible` ;
- distances FR déjà corrigées et MPO FR déjà appliqué à +25,5 mm ;
- paramètres UK issus des fichiers HS2/NTE fournis ;
- event-driven par défaut, synchronisation, réutilisation et catch-up ;
- slot de sortie indépendant des timestamps sources ;
- une seule série par variable de sortie, UPSERT lors des recalculs ;
- configuration historique immuable, fichiers STAR*NET temporaires ;
- vue compacte et options avancées accessibles à tous ;
- Analysis Lab pour essais, résidus, ellipses et sauvegarde d'une nouvelle version.

## 4. Ancien prototype

L'ancien prototype est exploité de manière sélective : géométrie, algèbre, statistiques,
initialisation locale, timeline de configuration et composants de réseau/graphiques peuvent être
portés. Ses stores, ses résultats versionnés, son EDM global, sa persistance locale et ses mappings
inventés ne définissent pas le nouveau produit. La matrice détaillée est dans
[`implementation/30-REUTILISATION-DU-PROTOTYPE.md`](implementation/30-REUTILISATION-DU-PROTOTYPE.md).

## 5. Points restant à valider avant production

Ils ne bloquent pas la maquette mais doivent être explicites :

- version exacte et interface d'automatisation de STAR*NET Ultimate installée sur Windows ;
- capacité de licence/concurrence et stratégie de lock ;
- fichiers natifs réellement activables par le CLI pour résidus, ellipses et exclusions Auto Adjust ;
- formule atmosphérique validée par la cellule topographique et ses plages T/P ;
- poids/centrages FR de production, volontairement non inventés dans le preset ;
- structure SQL finale des versions JSONB/tables enfants et mécanisme d'audit BTM réutilisé ;
- politique de rétention des diagnostics de runs et sessions Analysis Lab ;
- convention de métriques/unités des variables de sortie dans le catalogue BTM.

Ces éléments doivent être matérialisés en ADR ou décision de projet lorsqu'ils deviennent difficiles
à inverser. Une inconnue ne doit jamais être résolue en recopiant silencieusement une valeur UK dans
le preset France.
