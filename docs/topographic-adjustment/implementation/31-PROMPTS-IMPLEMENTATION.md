# Prompts détaillés d'implémentation

Ces prompts sont conçus pour être exécutés dans l'ordre. Joindre le dossier complet à chaque étape
ou demander explicitement à l'IA de relire les fichiers cités.

## Prompt 0 — audit et plan de reprise

> Lis `README.md`, `00-PROJET-GLOBAL.md`, `02-ARCHITECTURE-BTM-CIBLE.md`, tous les fichiers
> `domain/` et `implementation/30-REUTILISATION-DU-PROTOTYPE.md`. Audite le dépôt existant sans
> modifier le code. Produis une matrice `reuse / refactor / remove / new`, un graphe des dépendances,
> la liste des conflits avec les règles `PROC/DATA/TIME/...`, puis un plan de vertical slices.
> Vérifie les versions réellement installées dans `package.json` au lieu de supposer qu'elles sont
> identiques à la documentation. Ne propose ni Lambda, ni S3, ni réutilisation de Theodolite, ni
> moteur autre que STAR*NET en production. Termine par les risques et décisions techniques encore
> à confirmer, sans inventer de règle métier.

Livrable : plan signé par les fichiers/règles sources, aucun changement de code.

## Prompt 1 — domaine pur et contrats

> Implémente le domaine TypeScript de `domain/21-CONTRATS-DE-DONNEES.md` dans un module sans React.
> Ajoute des schémas Zod et fonctions pures pour : validation des noms moteur, résolution des
> templates, correction de distance, sélection T/P, slots, sélection fresh/reused/missing,
> timeline de configs, mapping physique, couverture d'initialisation et mapping des sorties.
> Porte les fonctions existantes indiquées comme réutilisables sans importer leur ancien store.
> Chaque erreur doit inclure `ruleId`, `code`, `fieldPath` et un message. Ajoute des tests pour
> toutes les règles P0 de `implementation/32-TESTS-CRITERES-ACCEPTATION.md`.

Livrable : package domaine pur, couverture de tests élevée, aucune UI.

## Prompt 2 — repositories, MSW et fixtures

> Crée les interfaces de repository et un DemoRepository MSW. Convertis le classeur ATS34 au
> build en JSON selon `demo/40-DONNEES-VERCEL.md`; n'ajoute aucun import dans l'UI. Expose les mêmes
> contrats qu'une future API BTM. Ajoute une fixture réseau synthétique distincte et clairement
> étiquetée. Implémente l'UPSERT simulé `(variableId,timestamp)` et les versions de configuration.
> Ajoute un écran développeur hors navigation pour provenance, reset et scénarios tardifs. Les
> handlers MSW servent à la fois Vitest et Playwright.

Livrable : API de démo déterministe, fixtures documentées, aucun composant métier couplé aux données.

## Prompt 3 — shell, design system et wizard étapes 1 à 3

> Lis `front/10-DESIGN-SYSTEM-ET-NAVIGATION.md` et
> `front/11-WIZARD-GENERAL-STATIONS-INSTRUMENTS.md`. Implémente la shell MUI, routes, stepper, draft,
> i18n, General, Stations et Instruments. Le projet est implicite. Déplace les métriques de données
> en format compact dans General. Stations contient seulement la sélection. Aucun EDM global dans
> la vue standard. Implémente les quatre modes atmosphériques et politiques T/P manquantes avec
> formule dépliable. Ajoute tests clavier, validation et changement France/UK avec diff.

Livrable : parcours fonctionnel étapes 1-3 et tests Playwright MSW.

## Prompt 4 — cibles, setups et points physiques

> Lis `front/12-WIZARD-TARGETS-POINTS-PHYSIQUES-INITIALISATION.md`, règles `MEAS`, `POINT`, `NAME`
> et `domain/23-STARNET-IO-ET-CORRECTIONS.md`. Implémente la table compacte, bulk edit et drawer
> Measurement setup pour Prism/Sheet/Reflectorless. Implémente l'identité distincte par défaut,
> réutilisation d'un mapping versionné, paires manuelles, `Check common points`, résidus H/V/3D en
> mm, validation humaine, relations géométriques et connectivité. Le jeu ATS34 mono-station ne doit
> produire aucun point commun. N'utilise jamais un nom ou AdjustmentName comme preuve.

Livrable : étape 4 fonctionnelle et tests 1/2/3 points, homonymes, collisions et réseau déconnecté.

## Prompt 5 — initialisation

> Implémente l'étape Initialisation. Pour un nouveau processing, sélectionne local-anchor et ne
> préremplis aucune coordonnée connue. Autorise E/N/H/orientation 0/0/0/0. Le mode références connues
> permet saisie, collage et import CSV strict de coordonnées uniquement. Calcule les représentants
> par médiane de Hz/Vz/Sd corrigée sur la fenêtre, affiche taux de disponibilité, absents,
> dispersion et erreurs géométriques. Réutilise les fonctions `initial.ts`/`localGeometry.ts` via le
> nouveau domaine. L'action est `Use as initial coordinates`.

Livrable : étape 5 calculante, tests de médianes, couverture et datum local/référencé.

## Prompt 6 — Adjustment, Run, Output et Review

> Lis `front/13-WIZARD-AJUSTEMENT-RUN-OUTPUT-REVIEW.md` et `domain/22-TEMPLATES-FR-UK.md`.
> Implémente uniquement des paramètres STAR*NET. Charge exactement les presets FR/UK, distingue
> convergence STAR*NET du solveur de démo et solution iterations d'Auto Adjust. Implémente Test one
> epoch via `AdjustmentEngine`, sélection de cycles, réutilisation, provisoire, catch-up, grille de
> sortie et variables stables. La publication de démo UPSERT le même timestamp. Review priorise les
> erreurs et affiche les engine names, fallbacks et corrections. Ajoute tests de scénarios temporels
> et aucun dead button.

Livrable : wizard complet et création atomique simulée.

## Prompt 7 — administration et Analysis Lab

> Lis `front/14-ADMINISTRATION-ANALYSIS-LAB.md`. Implémente liste, administration, timeline,
> comparaison, duplication/activation/archivage, détails de run, reprocessing et Analysis Lab.
> Réutilise les composants du wizard. Une version utilisée est immuable. Analysis Lab exécute
> baseline/trials, compare résidus/χ²/ellipses/rang et détecte les poids artificiellement gonflés.
> La sauvegarde crée une nouvelle config avec justification. Reprocessing montre un dry-run par
> version/slot et UPSERT les variables existantes.

Livrable : cycle d'administration complet et scénarios Playwright.

## Prompt 8 — builder STAR*NET de prévisualisation

> Implémente un builder pur conforme à `domain/23-STARNET-IO-ET-CORRECTIONS.md` qui génère en mémoire
> une preview `.dat` et `.snproj` à partir d'un snapshot. Le builder écrit les distances inclinées
> finales après corrections et n'utilise pas `.SCALE` pour l'atmosphère. Il génère C/DB/DM/DE,
> HI/HT, noms compatibles et mapping inverse. Ajoute des golden tests UK et FR. N'exécute pas
> STAR*NET dans Vercel et n'implémente aucun accès filesystem de production.

Livrable : preview déterministe, golden files et documentation du contrat futur Windows.

## Prompt 9 — adaptation BTM API et base

> Dans le monorepo BTM, ajoute la migration enum `Topographic Adjustment`, les tables/configs
> minimales de `02-ARCHITECTURE-BTM-CIBLE.md`, les routes Fastify TypeScript/Zod et la création
> atomique processing+variables. N'ajoute aucune route Express. Implémente versions immuables,
> résolution par slot, jobs idempotents, mappings explicites de variables, output variables stables
> et UPSERT measures. Écris des migrations forward-only et tests Fastify/PostgreSQL. N'implémente
> pas Lambda/S3.

Livrable : backend BTM testé avec API contractuelle.

## Prompt 10 — service Windows STAR*NET

> Implémente un service Windows séparé selon `02-ARCHITECTURE-BTM-CIBLE.md` et
> `domain/23-STARNET-IO-ET-CORRECTIONS.md`. Il réclame les jobs PostgreSQL avec idempotence, lit les
> données bornées, résout le snapshot, crée un dossier isolé, génère les fichiers, acquiert le lock
> licence, lance STAR*NET Ultimate, parse uniquement les sorties natives, valide puis UPSERT toutes
> les mesures dans une transaction. Supprime le dossier après commit. En échec, stocke étape/code/
> message/config/run sans considérer les fichiers comme archive. Ajoute tests golden et mécanisme
> de nettoyage des workspaces orphelins.

Livrable : worker installable, observable, idempotent et testé.

## Prompt 11 — QA final

> Exécute la checklist de `implementation/32-TESTS-CRITERES-ACCEPTATION.md`. Cherche les violations
> des règles numérotées, les champs sans effet, les unités ambiguës, les valeurs codées dans l'UI,
> les boutons morts et les différences MSW/API réelle. Vérifie accessibilité, i18n, responsive,
> performance des grandes tables et absence d'import brut. Corrige les problèmes, relance tests,
> build et E2E, puis produis un rapport de couverture avec preuves et risques restants.

Livrable : build vert et rapport de validation.

