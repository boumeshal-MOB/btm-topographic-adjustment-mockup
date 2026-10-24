# Moteur Rust `btm-topographic-adjustment`

Port Rust fidèle du noyau Python `packages/python/topographic-adjustment-core` (`adjust_network`,
`auto_adjust`). Même modèle euclidien local, même JSON en entrée et en sortie. Le Python et le miroir
TypeScript restent la référence ; ce moteur ne remplace rien, il ajoute un troisième choix
« Calcul rapide (Rust) » à côté de l'aperçu scientifique et de STAR*NET.

Hors périmètre, comme pour le Python : facteur d'échelle, courbure, réfraction, projection — ils
restent de la responsabilité de STAR*NET certifié.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/lib.rs` | Moteur : préparation des visées, Gauss-Newton creux, statistiques, auto-adjust, contrat Lambda (`handle`) |
| `src/lambda.rs` | Binaire AWS Lambda (`bootstrap`, feature `lambda`) |
| `src/wasm.rs` | ABI navigateur sans glue générée (feature `wasm`) |
| `parity.py` | Construit les cas de parité/bench et exécute la référence Python |
| `tests/parity.rs` | Rejoue chaque cas en Rust et compare aux marges convenues |
| `../../../public/engines/btm_topographic_adjustment.wasm` | Build WASM commité, utilisé par la maquette |

## Contrat

Identique à `packages/lambdas/topographic-adjustment/handler.py`, contrat
`btm.topographic-adjustment.v1`, pour les deux opérations de calcul :

```json
{ "contract_version": "btm.topographic-adjustment.v1", "request_id": "…",
  "operation": "adjust" | "auto-adjust", "payload": { "points": […], "observations": […] | "sights": […], "default_weights": {…}, "constraints": […], "options": {…} },
  "auto_adjust": { "enabled": true, "max_standardized_residual": 3, "max_iterations": 5, "outliers_removed_per_iteration": 1 } }
```

Réponse `{ statusCode: 200, result }` ou `{ statusCode: 422, error: { code: "INVALID_TOPOGRAPHIC_INPUT", message } }`.
Toute autre opération (`initialise`, `prepare-sights`, `correct-distance`, `synchronise`) reste sur la
Lambda Python et répond 422 ici. Le résultat ajoute seulement `"engine": "rust"` ; `iterations` et
`message` sont propres au solveur. `NaN` sort en `null` (JSON n'a pas de NaN).

## Déployer la Lambda

```bash
cargo install cargo-lambda            # une fois ; utilise zig pour cibler la glibc d'AL2023
cargo lambda build --release --features lambda --arm64   # ou sans --arm64 pour x86_64
# → target/lambda/bootstrap/bootstrap.zip, runtime provided.al2023, handler sans objet
```

L'API BTM appelle cette Lambda à la place de la Lambda Python quand l'utilisateur choisit
« Calcul rapide (Rust) », avec exactement le même événement.

## Intégration navigateur

`src/domain/engine/rust-engine.ts` charge le `.wasm`, envoie le même événement Lambda via
`handle_json` et traduit le résultat vers le contrat du miroir TypeScript (`adjustNetwork`).
`demo-engine-core.ts` reçoit le solveur en paramètre : diagnostic et auto-adjust sont partagés.

Après toute modification de `src/`, `Cargo.toml` ou `Cargo.lock`, reconstruire et recommiter :

```bash
cargo build --release --target wasm32-unknown-unknown --features wasm --lib
cp target/wasm32-unknown-unknown/release/btm_topographic_adjustment.wasm ../../../public/engines/
```

Le `.wasm` embarque l'empreinte de ses sources (`source_hash`) ; le test
`src/domain/engine/__tests__/demo-engine-core.test.ts` échoue si le binaire commité est périmé.

## Performance

Python forme la matrice de conception dense et la décompose en SVD à chaque appel. Ici, chaque
observation reste une ligne creuse (au plus 7 coefficients), la matrice normale est accumulée
directement et résolue par Cholesky ; la SVD dense n'est utilisée qu'en repli quand la matrice
normale est singulière ou mal conditionnée, pour garder exactement le diagnostic de rang de Python.

## Parité et bench

```bash
# depuis la racine du dépôt
PYTHONPATH=packages/python/topographic-adjustment-core/src python packages/rust/topographic-adjustment/parity.py
cd packages/rust/topographic-adjustment && cargo test --release --test parity -- --nocapture
```

Mesuré le 24/10/2026 sur Windows, Rust 1.99.1 natif : **0 écart** dans les deux campagnes. Le
gain dépend de la pile Python ; la Lambda Python de production est en 3.12.

| Jeu | Opération | Cas | Python 3.12 (numpy/scipy récents) | Rust | Gain | Écart max coordonnées |
|---|---|---:|---:|---:|---:|---:|
| Catalogue v1 (100 jeux) | adjust | 100 | 31,4 s | 0,54 s | ×58 | 6,9e-9 m |
| Catalogue v1 (1 jeu sur 10) | auto-adjust | 10 | 3,6 s | 0,07 s | ×48 | 2,2e-10 m |
| FVD_STA1, 120 époques une par une (94 prismes, CI/CII) | adjust | 120 | 22,7 s | 0,75 s | ×30 | 2,2e-6 m |

Avec Python 3.10 (numpy 1.26, scipy 1.11), campagne complète de 320 cas : ×129 (adjust),
×122 (auto-adjust, 100 jeux), ×34 (FVD). Une époque FVD prend environ 6 ms en Rust contre
190 ms en Python 3.12. Le cas FVD est un bench (station libre, quatre prismes tenus à 1 mm), pas
une configuration de production.

Marges : coordonnées 1e-5 m, orientations 1e-7 rad, sigmas/ellipses/résidus 1e-4 relatif,
statistiques 1e-6 relatif ; `ok`, rang, degrés de liberté, statut χ² et exclusions de l'auto-adjust
identiques. La CI lance `parity.py --quick` (auto-adjust sur un jeu sur dix).

## Différences connues

- **Liste `deficient_unknowns` d'un réseau déficient.** Le rang est identique, mais la liste coupe
  un vecteur du noyau à 10 % de son maximum : une inconnue proche du seuil (bande 5–20 %) peut
  basculer d'un côté à l'autre (vu sur 1 époque FVD avec un seul point tenu). Le test l'admet
  dans cette bande uniquement.
- **Convergence.** Gauss-Newton s'arrête quand le pas est sous `convergence_threshold_m` ; SciPy
  peut s'arrêter plus tôt sur ses critères relatifs. Écart observé ≤ 2,2e-6 m.
- **Pas de comparaison STAR*NET** dans ce lot : le moteur Rust reproduit le Python, l'écart
  Python/STAR*NET reste suivi dans `docs/topographic-adjustment/VALIDATION.md`.
