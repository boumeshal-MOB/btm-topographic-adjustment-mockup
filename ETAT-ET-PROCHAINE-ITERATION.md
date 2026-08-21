# État de la maquette et point de départ de la prochaine itération

Écrit le 21 août 2026, après le merge de la PR #44. **Cette version est validée par le propriétaire.**
Ce document existe pour qu'une session qui démarre sans contexte sache ce qui vient d'être décidé, ce
qui a déjà coûté cher, et où reprendre. Il ne remplace pas les documents de périmètre
(`docs/topographic-adjustment/`) : il dit ce que la dernière itération a changé et pourquoi.

---

## 1. Ce que l'itération a livré

| PR | Sujet | En une ligne |
|---|---|---|
| #37 | Référentiel dans la configuration | Le référentiel se décide sur les prismes, avant l'ajustement ; deux références suffisent. |
| #38 | Cibles et mesures | Tableau dense, édition en lot par sélection, précisions déplacées dans Instruments. |
| #39 | Nettoyage du dépôt | Six documents de périmètre fusionnés en trois, code mort supprimé, `§N` faux corrigés. |
| #40 | Référentiel dégénéré | `varianceFactor = NaN` traversait JSON en `null` et cassait l'écran ; `format.ts` créé. |
| #41 | Le même crash, ailleurs | Les tables de points portaient les mêmes valeurs ; règle « une seule PR » écrite. |
| #42 | Fermeture de la famille | 63 rendus numériques restants gardés ; capture de revue réparée et sortie de la suite. |
| #43 | Les coordonnées | Le record de contrainte ne porte plus les nombres ; variables d'output affichées ; 405 expliqué. |
| #44 | Station libre, un moteur | La station n'est plus tenue dans les runs ; un essai n'affiche que le moteur qui a tourné. |

---

## 2. Règles produit établies pendant l'itération

Elles sont dans `CLAUDE.md` (invariants) et dans `PRODUIT-ET-PARCOURS.md`. Résumé de ce qui a changé,
avec le *pourquoi*, parce que c'est le pourquoi qui empêche de les défaire :

**Coordonnées.** L'initialisation est la **seule** source. Un enregistrement de contrainte
(`DraftReference`) porte la décision fixe/contraint/libre et le sigma, **jamais les nombres**.
`resolveNetworkCoordinates` (`src/demo/network-coordinates.ts`) les résout dans l'ordre
`saisie à la main → déclarée par l'arpentage → calculée par l'initialisation`. Aucune des trois : le
point n'a pas de coordonnée, il affiche `—` (jamais `0`) et ne peut pas être contraint.
→ Un zéro écrit à sa place a épinglé un réseau à l'origine et fait remonter un `NaN` trois écrans plus
loin. `resolve-run.ts` ré-énonce les coordonnées au moment du run, donc un brouillon qui traîne un zéro
est réparé même sans repasser par l'écran.

**Station.** Fixer une station est un **dispositif de calcul** pour l'initialisation, jamais un
référentiel de run. Elle est libre dès qu'un seul point est contrôlé ; elle ne reste tenue que si rien
d'autre ne tient le réseau (sinon matrice normale singulière). Le terme « repère local » a disparu de
l'interface : la position tenue peut être la vraie position géoréférencée. La valeur stockée du mode
reste `local-anchor` — la renommer migrerait des brouillons et le schéma de version pour un mot.

**Référentiel minimal.** Deux points **contraints ou fixes** parmi les cibles visées. Ni le rôle ni la
provenance de la coordonnée n'entrent dans le test : fixer une station pour calculer les
approximations puis contraindre deux cibles est un référentiel valide. En dessous de deux, la
computation ne passe pas — donc c'est une **erreur** rouge et bloquante, pas un avertissement.

**Point observé sans coordonnée initiale.** Il entre libre à `0/0/0` avec un message qui dit d'où
vient le zéro. L'écarter silencieusement faisait disparaître une observation réellement faite.

**Désaccord de repère.** Si une contrainte est à plus d'un kilomètre de l'approximation du même point,
le référentiel et les coordonnées approchées ne sont pas dans le même repère (typiquement : station
fixée à `0/0/0/0` pour rayonner, puis vraies références contraintes par-dessus). Le solveur ne
converge pas sur cette distance. C'est un **avertissement**, pas un blocage — à trancher, voir §5.

**Variables de sortie.** Prismes **et stations** : une station est libre pendant l'ajustement, sa
position bouge d'un run à l'autre comme celle d'un prisme. Scope `station`, clé
`station:<stationId>:<composante>`. L'onglet Output ne montre plus un compte mais les variables
valorisées sur le cycle de l'essai. `Delta = ajusté − coordonnée initiale` ; un point non résolu
affiche `—`, jamais un delta de zéro (« non observé » ≠ « n'a pas bougé »).

**Moteurs.** Un essai n'affiche jamais les chiffres d'un autre moteur que celui qui a tourné. Lancer
un test remet les résultats à zéro ; changer de moteur remet **aussi** les essais à zéro ; avec
STAR*NET rien n'est affiché, enregistré ni marqué comme passé avant la réponse du service — générer
les fichiers d'entrée n'est pas un résultat. Une ligne d'essai sous licence lit le listing STAR*NET
(`starnetTrialMetrics`) ; ce que le listing ne donne pas reste non fini et s'affiche `—`.

**Affichage des erreurs.** Le message de STAR*NET d'abord et **verbatim** ; une explication peut
s'ajouter dessous ; le reste va dans une bulle. Les avertissements ne doivent pas perturber. Le rouge
est réservé aux cas où le calcul ne passe pas.

**Densité.** Un tableau énonce, un panneau édite. Une station porte jusqu'à cent prismes : pas de
champ de formulaire par valeur dans une ligne, et la modification de masse passe par une sélection.

---

## 3. Pièges techniques, déjà payés

Chacun a coûté au moins une passe de correction. Les relire coûte moins cher que les redécouvrir.

**`JSON.stringify` n'a pas de représentation pour `NaN` ni `Infinity` : les deux arrivent en `null`.**
`null.toFixed(2)` casse la route entière et le message remonte loin de sa cause ; `(null * 1000).toFixed(2)`
ne casse rien et affiche **`0.00`**, ce qui est pire parce que personne ne le voit. Tout rendu numérique
qui traverse l'API passe par `src/features/shared/format.ts` (`fixed`, `millimetres`, `withUnit`,
`isRealNumber`). Un champ numérique MUI passe par `valueForNumberInput`. Ce qui reste en `.toFixed`
brut est volontaire : `preview-builder.ts` écrit le `.dat`/`.prj`, où un tiret cadratin serait un bug
plus grave qu'une valeur manquante.

**Fins de ligne mixtes LF/CRLF, par fichier, sans `.gitattributes` et `core.autocrlf=false`.** Une
édition en mode texte a produit 2170 suppressions pour 78 vraies modifications. Tout script d'édition
lit et écrit les **octets**, détecte la convention du fichier et la restitue. Vérifier avant de
committer : comparer la convention du fichier avec celle de `git show HEAD:<path>`. L'outil `Edit` a
déjà retourné un fichier de LF en CRLF.

**Le backend de démo est un service worker (MSW).** Quand il ne contrôle plus la page, la requête part
sur le réseau, matche le rewrite `"/(.*)" -> "/index.html"` de `vercel.json` — un GET récupère alors la
coquille de l'application avec un statut 200, un PUT récupère un **405**. `src/api/client.ts` distingue
les deux, attend `navigator.serviceWorker.ready`, rejoue **une** fois, et sinon le dit clairement. Ne
pas élargir le rejeu : rejouer une mutation que le backend a refusée serait pire que l'erreur.

**Une station a deux clés.** Le moteur la nomme par son `stationCode` ; son point physique et son
enregistrement de coordonnée sont sous `station:<code>` (`stationPointId`). Les mélanger ne publie
rien et ne lève aucune erreur.

**Clés i18n : le nesting est obligatoire.** `"origin.manual"` à plat dans le JSON n'est jamais résolu
par `t('wizard.datum.origin.manual')` — i18next découpe sur le point. Après toute édition programmée
du JSON, vérifier que chaque clé se résout par son chemin.

**Pièges MUI déjà rencontrés.** `placeholder` invisible sur un `TextField` outlined sans
`InputLabelProps={{ shrink: true }}` ; `Select` vide sans `displayEmpty` ; `SelectDisplayProps` refuse
les `data-*` (typé `HTMLAttributes<HTMLDivElement>`) ; `text-transform: uppercase` transforme `σ` en
`Σ`. Ces trois-là ont passé le typecheck et les tests : ils n'ont été vus que sur les captures. **Lire
les captures, pas seulement les produire.**

**Un `useEffect` qui écrit le brouillon au montage finit en `Maximum update depth exceeded`**, remonté
loin de la cause : `update` est recréé à chaque rendu. Aucun écran ne modifie la configuration à son
montage.

**Tests locaux instables, verts en CI.** `ValidationCataloguePage` et `AnalysisLabPage` lisent le
manifeste et un shard **réels** depuis le disque, et le dépôt est sur un dossier OneDrive synchronisé :
sous charge ils dépassent leur timeout (un test qui passe met déjà 13,4 s contre une limite de 15 s).
`StarNetVmBridgeCard` de même. Ils passent isolés et sur le runner. Ne pas « corriger » ces tests :
scinder la suite ou les lancer seuls.

**Les captures de revue sont hors suite** : `BTM_CAPTURES=1 npx playwright test e2e/screenshots.spec.ts --workers=1`.
Le spec écrit ses PNG **hors du dépôt** (`../screenshots/`).

---

## 4. Discipline de livraison

Erreur commise plusieurs fois, écrite dans `CLAUDE.md`, à ne plus refaire :

- **Une seule PR ouverte à la fois, inconditionnellement.** S'il y en a une, on ajoute des commits
  dessus. Même si le sujet paraît différent.
- **Avant de pousser sur une branche, vérifier que sa PR est encore ouverte.** Une PR mergée ne
  déclenche plus la CI (le workflow écoute `pull_request` et `push: [main]`) : le commit part dans le
  vide, personne ne le voit, et on annonce livré ce qui n'a atteint personne.
- Après un merge : repartir de `main` à jour, supprimer la branche mergée (locale **et** distante).
- **Vérifier la CI sur le SHA poussé**, via `actions/runs?branch=…`, en comparant `head_sha` au HEAD
  local. Un check-run Vercel vert ne dit rien sur le fait que le workflow ait tourné.
- Ne jamais cherry-picker pour rattraper un mauvais aiguillage : deux SHA pour un contenu, plus une
  branche fantôme.
- La PR est envoyée **quand le travail est fini** : rien en cours, rien qui tourne, arbre propre. Le
  propriétaire merge seul, directement.
- Pas de `gh` CLI dans cet environnement : l'API GitHub via le credential helper git, jeton **jamais**
  affiché.

---

## 5. Ouvert, et pistes pour la prochaine itération

**À trancher par le propriétaire :**

1. **Désaccord de repère (> 1 km entre une contrainte et l'approximation du même point)** : c'est
   aujourd'hui un avertissement. Faut-il bloquer ? Argument pour bloquer : l'ajustement ne converge
   jamais, donc le run échoue de toute façon, et l'échec est moins lisible que le refus. Argument
   contre : la configuration est légale et le seuil est arbitraire.
2. **Deux branches locales portent un commit non mergé**, gardées à la demande :
   `agent/lab-ux-stability-map-tables` (`649af52`) et `agent/native-files-and-constraint-parity`
   (`3d73c11`). À reprendre ou à supprimer.

**Pistes d'amélioration repérées mais non traitées** (aucune n'est un engagement) :

- La correction manuelle d'une coordonnée n'existe qu'à l'étape Initialisation. Le tableau du
  référentiel, dans Ajustement, la montre mais ne l'édite pas — cohérent avec « un tableau énonce »,
  peut-être frustrant à l'usage.
- Le diagnostic numérique de l'aperçu n'est plus affiché sous un run STAR*NET. Le listing natif n'est
  pas parsé en points ajustés : les coordonnées de STAR*NET ne sont donc pas comparées à celles de
  l'aperçu. Une comparaison des deux moteurs point par point serait la suite logique.
- `draft.testEpoch` ne conserve que les positions ajustées. Les résidus et les fichiers natifs restent
  hors du brouillon, volontairement ; si l'onglet Output doit montrer plus, c'est ce choix qu'il faut
  revisiter.
- Le seuil `FRAME_MISMATCH_M = 1000` et `DEFAULT_SIGMA_M = 0.0015` sont des constantes de code, pas
  des valeurs de template pays. À déplacer si un pays doit les changer.
- `src/repositories` contient des interfaces sans implémentation, **volontairement** : c'est le seam
  que la reprise BTM remplace. Ne pas le supprimer comme du code mort.

**Où lire quoi :** `PROJECT_MAP.md` pour l'architecture, puis **un seul** des trois documents de
`docs/topographic-adjustment/` — `PRODUIT-ET-PARCOURS.md` (parcours et UX),
`DOMAINE-ET-STARNET.md` (contrats, formules, génération STAR*NET), `VALIDATION.md` (ce qui est
vérifié, ce qui est résolu, ce qui reste ouvert). Ne jamais ouvrir en entier
`src/demo/fixtures/ats34.generated.json` ni les shards `public/demo-datasets/v1/shards/*.json`.
