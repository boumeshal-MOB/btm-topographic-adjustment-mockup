# Tests et critères d'acceptation

## 1. Priorités

- **P0** : condition de validation de la maquette et de l'intégration BTM.
- **P1** : nécessaire avant production pilote.
- **P2** : amélioration après validation du flux principal.

## 2. Données et provenance

- **P0** — La fixture ATS34 contient 6 494 observations, une station `NTE_ATS34`, 42 cibles
  observées, 43 lignes Lookup et 10 lignes Header.
- **P0** — La période réelle est du 2025-03-01 00:02:58Z au 2025-03-31 20:12:32Z.
- **P0** — Les constantes présentes dans la Lookup sont 0, 0,0089 et 0,0300 m.
- **P0** — Le jeu ATS34 est étiqueté UK demo et n'affiche aucun import de fichier.
- **P0** — Aucun point commun multi-stations n'est déduit du classeur mono-station.
- **P1** — Le convertisseur ignore les colonnes de note sans perdre les sept colonnes brutes.
- **P1** — Une route développeur affiche le hash/version de fixture et permet un reset.

## 3. General et Stations

- **P0** — Aucun champ Project dans General.
- **P0** — Scope Single station/Network est dans General.
- **P0** — Période, dernière observation, volume, cibles et variables sont en résumé compact.
- **P0** — Stations affiche uniquement les stations disponibles et informations de choix.
- **P0** — Single station impose exactement une sélection.
- **P0** — Network exige au moins deux stations et refuse plusieurs composantes indépendantes à la fin.
- **P1** — Un setup antérieur compatible peut être réutilisé avec diff.

## 4. Instruments et mesures

- **P0** — Aucun EDM global ne sert d'autorité de calcul.
- **P0** — Une station contient Prism, Sheet et Reflectorless dans le même cycle.
- **P0** — Reflectorless masque les constantes et applique delta 0.
- **P0** — Une feuille utilise un setup distinct.
- **P0** — `required − alreadyApplied` est testé avec signes positifs/négatifs/nuls.
- **P0** — France MPO : 25,5 − 25,5 = 0 mm.
- **P0** — UK L-bar : 8,9 − 0 = +8,9 mm ; 78,4100 devient 78,4189 m avant arrondi.
- **P0** — La précision Topcon varie par Prism/Sheet/Reflectorless.
- **P1** — Un changement EDM incompatible bloque la ligne.
- **P1** — Bulk edit configure 50 cibles puis trois exceptions sans modifier les autres.

## 5. Atmosphère

- **P0** — Les quatre modes sont présents.
- **P0** — T/P du cycle n'affiche que des variables compatibles et conserve leurs IDs.
- **P0** — Formule et version sont affichables.
- **P0** — T/P manquantes applique exactement la politique choisie.
- **P0** — Fallback/provisoire/catch-up sont cohérents.
- **P0** — Une distance déjà corrigée ne reçoit aucune correction atmosphérique.
- **P0** — `.SCALE` ne varie pas avec T/P.
- **P1** — Une T/P tardive produit un catch-up du même slot.

## 6. Points physiques

- **P0** — Deux cibles homonymes de stations différentes restent distinctes.
- **P0** — Deux noms différents peuvent être liés au même PhysicalPoint après confirmation.
- **P0** — Un seul point commun sans orientation connue bloque Check.
- **P0** — Deux points donnent Weak geometry.
- **P0** — Trois points distribués permettent la proposition robuste.
- **P0** — Les candidats ne deviennent jamais confirmés sans action utilisateur.
- **P0** — H/V/3D residuals affichent `mm` dans l'en-tête.
- **P0** — Les cibles individuelles ne sont pas dans Shared physical points.
- **P0** — Une ligne de base ne fusionne pas ses points.
- **P0** — Une collision engineName bloque Review.
- **P1** — Rejet d'un candidat reste audité dans la version/draft.
- **P1** — Un mapping historique est réutilisé uniquement par IDs stables et provenance.

## 7. Initialisation

- **P0** — Nouveau processing : local-anchor sélectionné, aucune coordonnée connue préremplie.
- **P0** — 0/0/0/0 est accepté.
- **P0** — La fenêtre est présentée comme source des observations, pas comme validité.
- **P0** — Médiane utilisée, pas première/dernière mesure.
- **P0** — Taux de points et station-target pairs disponibles est exact.
- **P0** — Les absents sont listés.
- **P0** — Une estimation multi-stations affiche dispersion H/V.
- **P0** — Un réseau déconnecté ou non orientable produit une erreur actionnable.
- **P1** — CSV coordonnées accepte le format documenté et rejette doublons/unités/valeurs invalides.

## 8. Adjustment et STAR*NET

- **P0** — UK charge DMS, 0.07, 6 372 000, 0.01, 10, χ² 5 %, confiance 95 % et Auto Adjust 3/1/20.
- **P0** — FR charge Gons, 0.13, 6 371 000, 0.01, 30, χ² 5 %, confiance 95 %.
- **P0** — Convergence est affichée sans unité.
- **P0** — Auto Adjust 20 n'écrase pas maximum solution iterations UK 10.
- **P0** — Aucun champ CoMeT n'apparaît.
- **P0** — Les previews C/DB/DM/DE utilisent les engine names et HI/HT corrects.
- **P0** — Le builder pré-corrige Sd et n'utilise pas `.SCALE` pour l'atmosphère.
- **P0** — Le test epoch ne publie pas.
- **P1** — Golden tests `.dat/.prj` FR et UK, dont égalité au template natif UK hors valeurs autorisées.

## 9. Run, synchronisation et catch-up

- **P0** — :25/:26/:32 produit un slot :30 avec tolérance adaptée.
- **P0** — Les timestamps source restent visibles et inchangés.
- **P0** — Une station réutilisée dans l'âge max produit Provisional.
- **P0** — Au-delà de l'âge max, une station requise bloque.
- **P0** — Une station optionnelle suit la politique choisie.
- **P0** — L'arrivée tardive recalcule le même slot, sans nouvelle variable.
- **P0** — Le catch-up utilise la config valide historiquement.
- **P1** — Idempotency key empêche deux publications concurrentes du même job.
- **P1** — Maximum recalculs/slot et fenêtre sont respectés.

## 10. Output

- **P0** — Les variables appartiennent au processing.
- **P0** — Une nouvelle configuration ne crée aucune variable supplémentaire.
- **P0** — X/Y/Z, Delta et Sigma sont mappés par cible.
- **P0** — Delta = ajusté − initial de la version du slot.
- **P0** — Chi2 Passed est 1/0 et Variance Factor numérique.
- **P0** — References Available compte les références réellement utilisées.
- **P0** — Target Availability utilise le dénominateur des cibles de sortie actives.
- **P0** — Recalcul fait UPSERT sur `(variable_id,timestamp)`.
- **P0** — Une cible absente n'obtient pas de valeur inventée.

## 11. Versions et reprocessing

- **P0** — Une version utilisée est en lecture seule.
- **P0** — L'édition crée un draft avec diff.
- **P0** — Intervalles actifs ne se chevauchent pas.
- **P0** — Reprocessing sur une frontière choisit les bonnes versions par slot.
- **P0** — Une version archivée reste utilisable historiquement.
- **P0** — La stratégie forcée exige une justification et un aperçu.
- **P0** — Les résultats restent uniques dans measures.
- **P1** — Activation atomique ajuste validTo de la version précédente selon la règle décidée.

## 12. Analysis Lab

- **P0** — Baseline immuable.
- **P0** — Trials modifient uniquement des overrides locaux.
- **P0** — Comparaison affiche χ², variance, max stdres, rang et ellipses.
- **P0** — Gonflement excessif des sigmas produit un diagnostic.
- **P0** — Trop d'exclusions ou dof faible produit un diagnostic.
- **P0** — Save candidate crée une nouvelle config avec justification.
- **P1** — Session consultable en lecture seule selon la politique de rétention retenue.

## 13. Concurrence et isolation

- **P0** — Cinq processings peuvent simultanément utiliser `STA1/MPO001` dans des workspaces isolés.
- **P0** — Aucun mapping ne traverse un processing.
- **P0** — Un lock de licence empêche les exécutions STAR*NET incompatibles.
- **P0** — Un échec de parsing ne publie aucune mesure partielle.
- **P0** — Le workspace n'est supprimé qu'après commit.
- **P1** — Nettoyage des workspaces orphelins et recovery après crash.

## 14. UX, accessibilité et performance

- **P0** — Aucun bouton principal sans comportement.
- **P0** — Advanced options accessible à tous.
- **P0** — Toutes les unités visibles.
- **P0** — Erreurs avec action corrective et focus.
- **P0** — Parcours complet au clavier.
- **P0** — Contraste AA et statut non transmis par couleur seule.
- **P0** — Tables filtrables et édition en lot.
- **P0** — Aucune mention de données demo comme données production.
- **P1** — 1 000 cibles restent manipulables grâce à virtualisation/pagination.
- **P1** — i18n en/fr complet et fallback anglais pour les autres locales.

## 15. Definition of Done

La maquette est validable lorsque :

- build TypeScript strict réussi ;
- tests unitaires/compteurs de règles verts ;
- E2E MSW des parcours P0 verts ;
- audit accessibilité sans erreur critique ;
- les données ATS34 sont accessibles sans import ;
- wizard complet et testable ;
- administration, Analysis Lab et reprocessing fonctionnent ;
- aucune contradiction listée dans `implementation/30-REUTILISATION-DU-PROTOTYPE.md` ne subsiste ;
- un rapport final mappe chaque critère P0 vers un test ou une preuve UI.
