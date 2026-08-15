# Contexte Claude Code — refactoring UX, modules d’affichage et validation scientifique

## 1. Mission

Travaille sur le dépôt :

`boumeshal-MOB/btm-topographic-adjustment-mockup`

Ce document complète :

`01-PROMPT-100-JEUX-DONNEES-TOPOGRAPHIQUES.md`

L’objectif est de livrer, dans **une seule Draft PR fonctionnelle** :

1. les 100 jeux de données topographiques demandés ;
2. leur intégration dans la maquette ;
3. un Analysis Lab adapté à leur exploration et à leur validation ;
4. un refactoring du design et des modules d’affichage ;
5. une protection explicite des moteurs et comportements scientifiques déjà validés ;
6. une suite de tests exécutée pendant le développement, pas ajoutée après coup.

Tu disposes d’une liberté réelle sur la conception visuelle et l’organisation interne. Tu ne dois pas reproduire à l’identique l’ancienne maquette. En revanche, ne réécris pas les calculs scientifiques uniquement pour faciliter le frontend.

## 2. Ordre de lecture optimisé

Afin de limiter le contexte et les tokens :

1. lire intégralement `CLAUDE.md` ;
2. utiliser `PROJECT_MAP.md` et Graphify pour localiser le code ;
3. lire intégralement ce document ;
4. lire intégralement `01-PROMPT-100-JEUX-DONNEES-TOPOGRAPHIQUES.md` ;
5. inspecter les tests existants et les contrats des moteurs ;
6. consulter uniquement les autres documents nécessaires à une décision précise ;
7. produire un plan court orienté livrables, puis commencer l’implémentation.

Ne relis pas tout le corpus documentaire à chaque sous-tâche. Mets à jour le plan et le journal de décision au fil du travail.

## 3. Produit à préserver

La maquette représente le futur processing BTM de type :

`Topographic Adjustment`

Le processing permet notamment de :

- sélectionner une station seule ou un réseau connecté ;
- sélectionner les cibles/prismes et références ;
- établir le mapping des points physiques communs ;
- calculer ou fournir les coordonnées initiales ;
- configurer les instruments, observations et corrections ;
- configurer l’ajustement ;
- configurer les déclenchements, slots, synchronisations et catch-up ;
- produire les sorties ajustées ;
- versionner la configuration ;
- exécuter un calcul manuel ;
- analyser et comparer plusieurs essais dans l’Analysis Lab ;
- lancer, lorsque le service est disponible, un calcul réel avec STAR*NET 14 Ultimate.

La future intégration BTM utilisera les observations de `raw_data`. Les fixtures contenues dans la maquette sont uniquement des données de démonstration et de validation.

## 4. Moteurs protégés par le refactoring

Commence par identifier précisément les modules existants correspondant à :

- initialisation des coordonnées ;
- rayonnement mono-station ;
- rattachement d’un réseau par points physiques communs ;
- ajustement 3D par moindres carrés ;
- calcul des résidus et résidus standardisés ;
- χ², degrés de liberté et facteur de variance ;
- covariance, sigmas et ellipses de confiance ;
- corrections de distance ;
- réduction Cercle I/Cercle II ;
- sélection et synchronisation des époques ;
- Auto Adjust ou exclusion progressive ;
- génération des fichiers STAR*NET ;
- exécution via le service Windows ;
- lecture des résultats STAR*NET ;
- mapping des résultats vers les points et sorties BTM.

Ces modules sont des **composants scientifiques protégés** lorsqu’ils disposent déjà de tests ou de comparaisons validées.

Règles :

- ne pas déplacer de formules dans les composants React ;
- ne pas recalculer des résultats scientifiques dans les view models ;
- ne pas dupliquer un moteur en TypeScript pour simplifier un écran ;
- ne pas remplacer un contrat scientifique sans test de caractérisation ;
- ne pas considérer un bug connu comme un comportement à protéger ;
- toute correction scientifique doit être isolée, expliquée et couverte par une preuve indépendante ;
- conserver les sorties existantes pour les cas de référence dans les tolérances documentées.

Le terme « déjà validé » signifie : comportement soutenu par un test, un golden dataset ou une comparaison documentée. Il ne signifie pas qu’il faut geler aveuglément tout le code actuel.

## 5. Étape obligatoire avant le refactoring

Avant de modifier la structure des écrans :

1. exécuter toute la suite de tests actuelle ;
2. enregistrer les résultats de référence ;
3. identifier les jeux déjà comparés avec STAR*NET ;
4. créer les tests de caractérisation manquants autour des contrats utilisés par l’UI ;
5. noter séparément les tests déjà en échec avant intervention ;
6. vérifier les workflows suivants :
   - création d’un processing mono-station ;
   - création d’un processing réseau ;
   - reprise d’un brouillon ;
   - édition d’un processing ;
   - calcul dans l’Analysis Lab ;
   - sauvegarde d’une version candidate ;
   - génération STAR*NET ;
   - affichage d’un résultat STAR*NET réel ou du statut « non exécuté ».

Le refactoring visuel ne commence qu’après cette baseline.

## 6. Architecture cible, sans sur-ingénierie

Garde une séparation lisible entre :

### Domaine scientifique

- géométrie ;
- observations ;
- contraintes ;
- corrections ;
- ajustement ;
- diagnostics ;
- conventions d’unités ;
- formats STAR*NET.

### Cas d’usage

- charger un jeu ;
- préparer un essai ;
- exécuter un moteur ;
- comparer des essais ;
- révéler la vérité terrain ;
- créer une version candidate ;
- exécuter un lot de jeux de test.

### Adaptateurs

- fixtures de démonstration ;
- futur repository BTM ;
- moteur scientifique interne ;
- service STAR*NET Windows ;
- exports/imports ;
- stockage temporaire de l’état de la maquette.

### Présentation

- routes ;
- composants ;
- view models ;
- formatage des unités ;
- filtres ;
- tableaux ;
- graphiques ;
- états de chargement, avertissement et erreur.

La présentation consomme des résultats typés. Elle ne connaît pas les détails des équations.

Évite de créer des couches abstraites sans usage réel. Réutilise les services, hooks, schemas et composants existants lorsqu’ils sont cohérents.

## 7. Contrat d’affichage commun

Créer un modèle de présentation stable pour un résultat d’ajustement. Il doit pouvoir représenter un résultat issu :

- du moteur scientifique interne ;
- de STAR*NET ;
- d’un golden dataset ;
- d’un essai historique dans l’Analysis Lab.

Ce contrat doit contenir ou référencer au minimum :

- identité de l’essai ;
- moteur et version ;
- configuration utilisée ;
- convergence ;
- rang ;
- degrés de liberté ;
- χ² et statut ;
- facteur de variance ;
- points ajustés ;
- coordonnées initiales ;
- deltas ;
- covariance, sigmas et ellipses ;
- observations et résidus ;
- exclusions ;
- disponibilité des stations, références et cibles ;
- corrections appliquées ;
- alertes ;
- provenance du résultat.

Ne force pas les sorties STAR*NET et internes à être identiques si elles ne le sont pas. Utilise des champs optionnels explicites et affiche `Non disponible` plutôt qu’une valeur inventée.

## 8. Direction UX et design

L’interface cible doit être :

- moderne et professionnelle ;
- compacte mais respirante ;
- compatible avec le vocabulaire des géomètres/topographes ;
- compréhensible par un utilisateur occasionnel ;
- suffisamment détaillée pour un expert ;
- bilingue français/anglais via le système i18n existant ;
- utilisable sur les résolutions courantes d’un poste de travail BTM.

N’utilise pas le mot `profile` pour les instruments. Employer selon le contexte :

- modèle d’instrument ;
- configuration instrument ;
- modèle de mesure ;
- modèle de réflecteur.

Vocabulaire français recommandé :

| Terme fonctionnel | Libellé français |
| --- | --- |
| Total station | Station totale |
| Target | Cible |
| Prism | Prisme / réflecteur |
| Physical point | Point physique |
| Reference | Référence |
| Shared point | Point commun |
| Face I / Face II | Cercle I / Cercle II |
| Slope distance | Distance inclinée |
| Horizontal distance | Distance horizontale |
| Adjustment | Ajustement / compensation |
| Initial coordinates | Coordonnées initiales |
| Residual | Résidu |
| Standardized residual | Résidu standardisé |
| Confidence ellipse | Ellipse de confiance |
| Variance factor | Facteur de variance |
| Degrees of freedom | Degrés de liberté |

## 9. Principes d’interface

### Divulgation progressive

- afficher d’abord les décisions essentielles ;
- placer les options spécialisées dans des sections avancées repliables ;
- rendre les valeurs actives visibles même lorsque la section est repliée ;
- ajouter des explications courtes à la demande ;
- ne pas créer de rôles « standard/expert » : le niveau de l’administrateur n’est pas connu.

### Information utile

- une alerte doit expliquer l’impact et l’action possible ;
- une valeur absente ne doit jamais être remplacée silencieusement ;
- différencier clairement erreur bloquante, avertissement et information ;
- expliquer les unités dans les en-têtes ;
- afficher les conventions angulaires et de coordonnées actives ;
- ne pas afficher des coordonnées de démonstration comme si elles venaient de BTM réel.

### Mise en page

- éviter les doubles barres de défilement ;
- éviter les tables enfermées dans des zones trop basses ;
- permettre l’agrandissement d’un tableau ou d’un graphique ;
- garder les actions principales visibles ;
- utiliser une largeur fluide ;
- rendre les étapes du wizard compactes et lisibles ;
- préserver le contexte lorsqu’un utilisateur revient à une étape précédente.

### Performance

- charger les 100 jeux à travers un manifeste ;
- charger le contenu détaillé à la demande ;
- virtualiser uniquement les listes réellement volumineuses ;
- éviter les recalculs React inutiles ;
- ne pas bloquer l’interface pendant un calcul ;
- afficher une progression honnête et permettre l’annulation lorsque possible.

## 10. Écrans et modules à améliorer

### 10.1 Page principale

Elle doit permettre de distinguer immédiatement :

- les processings ;
- les brouillons ;
- l’accès au Laboratoire d’analyse ;
- les actions créer, éditer, dupliquer, activer/désactiver et archiver.

Le Laboratoire doit être accessible sans devoir ouvrir un processing existant.

### 10.2 Wizard de création et d’édition

Le même socle doit prendre en charge création et édition.

Ne pas reconstruire un état incomplet lors de l’édition. Les anciennes versions doivent rester immuables ; une modification crée une nouvelle version candidate selon les règles du produit.

Conserver les étapes fonctionnelles existantes, mais la présentation peut être repensée si elle reste plus simple :

1. Général ;
2. Stations ;
3. Instruments ;
4. Cibles et mesures ;
5. Initialisation ;
6. Ajustement ;
7. Run ;
8. Sorties ;
9. Vérification et création.

### 10.3 Analysis Lab

Faire de l’Analysis Lab un espace cohérent et non une succession de tableaux indépendants.

Prévoir quatre zones fonctionnelles :

1. sélection du jeu, de l’époque et du moteur ;
2. paramètres de l’essai ;
3. résultat et diagnostic ;
4. comparaison et sauvegarde.

L’organisation visuelle exacte reste libre.

### 10.4 Tableau unique des points

Utiliser une seule source de données et un seul tableau principal.

Ordre par défaut :

1. références partagées ;
2. références ;
3. autres points communs ;
4. stations ;
5. points de suivi.

Afficher selon les données disponibles :

- identité et rôle ;
- stations observatrices ;
- coordonnées initiales ;
- coordonnées ajustées ;
- ΔE, ΔN, ΔH, Δ3D ;
- σE, σN, σH ;
- ellipse ;
- observations ;
- résidu standardisé maximal ;
- inclusion/exclusion ;
- comparaison avec la vérité terrain après révélation.

Les filtres, la carte, les détails et le tableau doivent suivre le même essai sélectionné.

### 10.5 Carte et ellipses

- afficher stations, références, points communs et points de suivi avec des symboles distincts ;
- afficher les liaisons observées lorsque cela aide à comprendre la géométrie ;
- permettre d’activer/désactiver les ellipses ;
- utiliser une échelle d’ellipse explicitement indiquée ;
- ne pas présenter une ellipse agrandie comme une géométrie réelle ;
- sélectionner un point depuis la carte ou le tableau et synchroniser les deux vues.

### 10.6 Observations et résidus

Proposer une vue détaillée filtrable par :

- station ;
- point ;
- cycle ;
- série ;
- Cercle I/Cercle II ;
- Hz/Vz/Sd ;
- état inclus/exclu.

Afficher la contribution au diagnostic et regrouper les anomalies temporelles pour aider à distinguer vibration, mauvaise mesure isolée et référence potentiellement déplacée.

### 10.7 Comparaison des essais

Permettre de comparer clairement :

- baseline ;
- essais avec paramètres modifiés ;
- essais avec observations exclues ;
- moteur interne ;
- STAR*NET ;
- vérité terrain après révélation.

Le changement d’essai doit mettre à jour toutes les vues, sans conserver des chiffres appartenant à l’essai précédent.

## 11. Sauvegarde depuis l’Analysis Lab

Avant le refactoring, vérifier le comportement actuel de sauvegarde.

Le comportement cible est :

- l’utilisateur sélectionne un essai satisfaisant ;
- il indique une date d’effet et une justification ;
- il choisit explicitement les éléments à reprendre ;
- une nouvelle version candidate est créée ;
- l’ancienne version et ses runs restent immuables ;
- les coordonnées initiales éventuellement mises à jour proviennent uniquement de l’essai sélectionné ;
- les paramètres de mesure, références, contraintes, exclusions et ajustement sont sauvegardés selon les choix visibles ;
- aucun résultat d’un autre essai ne doit être mélangé ;
- les données brutes ne sont jamais modifiées.

Ajouter un écran de confirmation résumant les différences avant création de la version candidate.

## 12. Stratégie de tests pendant le développement

Les tests font partie de chaque modification. Ne reporte pas leur écriture à la fin.

### Niveau 1 — caractérisation

- capturer les entrées/sorties des moteurs sur les cas existants ;
- protéger les conventions et mappings ;
- protéger les résultats déjà comparés avec STAR*NET ;
- documenter les tolérances.

### Niveau 2 — domaine et contrats

- tests unitaires des schemas ;
- tests des adaptateurs ;
- tests des sélecteurs et view models ;
- tests des unités et formatages ;
- tests des champs indisponibles ;
- tests empêchant le mélange de deux essais.

### Niveau 3 — composants

- sélection d’un jeu ;
- changement de moteur ;
- modification des paramètres ;
- révélation de la vérité ;
- filtres du tableau ;
- synchronisation tableau/carte ;
- comparaison ;
- sauvegarde d’une version candidate.

### Niveau 4 — E2E

Tester au minimum :

- ouverture du Laboratoire depuis l’accueil ;
- jeu sain mono-station ;
- réseau avec points communs ;
- référence déplacée ;
- vibration temporaire ;
- erreur Hz, Vz et Sd ;
- correction atmosphérique avant/après ;
- courbure/réfraction ;
- Sd/Hd ;
- Cercle I/Cercle II ;
- édition d’un processing ;
- sauvegarde d’une version candidate ;
- comportement lorsque STAR*NET est indisponible ;
- résultat réel lorsque le service est explicitement configuré.

### Niveau 5 — non-régression visuelle

Ajouter des captures stables sur quelques écrans critiques, au minimum en :

- 1440 × 900 ;
- 1366 × 768.

Contrôler :

- absence de superposition ;
- absence de contenu coupé ;
- absence de double scroll inutile ;
- lisibilité des tableaux ;
- stabilité des états loading/error/empty/success ;
- cohérence français/anglais.

Ne remplace pas les assertions fonctionnelles par des screenshots.

### Niveau 6 — accessibilité et qualité

- navigation clavier ;
- labels de formulaire ;
- focus visible ;
- contrastes ;
- tableaux accessibles ;
- messages d’erreur associés aux champs ;
- absence d’erreurs console ;
- absence de warnings React ;
- build de production réussi.

## 13. Validation des 100 jeux pendant le refactoring

Les 100 jeux ne sont pas seulement des fixtures d’interface.

Créer une validation automatisée qui confirme :

- conformité au manifeste ;
- invariants géométriques ;
- reproductibilité ;
- absence de fuite de la vérité terrain vers le moteur ;
- cohérence des résultats attendus ;
- compatibilité du loader ;
- stabilité du rendu de l’Analysis Lab ;
- comparaison avec l’oracle ;
- comparaison STAR*NET lorsqu’elle est disponible.

Le batch interne des 100 jeux doit être exécutable localement et en CI dans un délai raisonnable. Les appels STAR*NET réels restent une validation séparée et conditionnelle.

## 14. Règles STAR*NET

- conserver le générateur de projet et le parser derrière des interfaces testables ;
- créer un dossier éphémère isolé par run côté service Windows ;
- ne jamais simuler un succès STAR*NET ;
- afficher le moteur réellement utilisé ;
- ne jamais publier la clé du service ;
- ne pas sauvegarder la clé dans le processing, le navigateur ou les fixtures ;
- ne pas faire dépendre la CI publique de la VM ;
- conserver des sorties natives anonymisées comme golden fixtures seulement lorsqu’elles sont autorisées et utiles ;
- signaler explicitement les différences de convention ou de modèle entre les moteurs.

## 15. Règles de refactoring

Autorisé :

- réorganiser les composants ;
- créer des view models ;
- simplifier les états ;
- améliorer le routage ;
- unifier les tableaux ;
- améliorer le design system ;
- renforcer i18n et accessibilité ;
- supprimer du code mort après preuve ;
- remplacer une implémentation UI fragile par une plus simple.

Interdit sans justification et tests dédiés :

- réécrire les moteurs scientifiques ;
- changer les conventions de coordonnées ;
- changer les unités internes ;
- modifier les poids par défaut ;
- changer les formules de correction ;
- modifier le format STAR*NET ;
- modifier le mapping des points physiques ;
- mélanger résultats preview et STAR*NET ;
- supprimer une fonctionnalité uniquement pour simplifier l’écran.

## 16. Definition of Done

La Draft PR est prête à être relue lorsque :

- les 100 jeux sont générés et intégrés ;
- le Laboratoire est accessible depuis l’accueil ;
- le nouveau design est fonctionnel et cohérent ;
- le tableau des points est unifié ;
- les essais pilotent toutes les vues ;
- le diagnostic des observations est exploitable ;
- la vérité terrain peut être masquée puis révélée ;
- la sauvegarde crée la bonne version candidate ;
- création, édition et reprise de brouillon fonctionnent ;
- les moteurs protégés conservent leurs résultats de référence ;
- les différences scientifiques éventuelles sont documentées ;
- les tests TypeScript, Python, E2E et build sont verts ;
- la CI GitHub est verte ;
- aucune clé ni URL temporaire sensible n’est commitée ;
- la PR contient des captures avant/après et un guide de test manuel ;
- la preview Vercel est directement testable si disponible.

## 17. Livraison

Travaille dans une branche dédiée et ouvre une seule Draft PR.

Ne merge pas. Ne déploie pas manuellement.

Dans la PR, fournir :

- résumé fonctionnel ;
- décisions d’architecture ;
- composants scientifiques protégés ;
- composants UI refactorés ;
- couverture des 100 jeux ;
- résultats des tests ;
- résultats de non-régression ;
- différences moteur interne/oracle/STAR*NET ;
- limites restantes ;
- lien de preview Vercel ;
- procédure de test pour le reviewer.

Si une exigence ne peut pas être réalisée proprement dans la même PR, ne la simule pas. Implémente le socle réellement fonctionnel, documente précisément la limite et laisse une tâche clairement bornée.

## 18. Instruction de lancement à donner à Claude Code

Utilise le texte suivant comme instruction de session :

> Lis `CLAUDE.md`, puis `00-CONTEXTE-CLAUDE-CODE-REFACTOR-DESIGN-ET-VALIDATION.md` et `01-PROMPT-100-JEUX-DONNEES-TOPOGRAPHIQUES.md`. Utilise `PROJECT_MAP.md` et Graphify pour localiser le code sans relire inutilement tout le corpus. Inspecte l’état actuel et les tests avant de modifier. Réalise l’objectif complet dans une seule Draft PR fonctionnelle : génère et intègre les 100 jeux, améliore l’Analysis Lab, refactore librement le design et les modules d’affichage, mais protège les moteurs scientifiques déjà caractérisés derrière leurs contrats et leurs tests. Écris les tests au fil des changements. Ne merge pas et ne déploie pas manuellement. Arrête-toi lorsque la CI est verte, que la preview est testable et que la PR contient les preuves de validation.
