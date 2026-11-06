# Pelican visual-build fixture

This directory is a pinned, partial copy of
[`AzatJalilov/PelicanSdf`](https://github.com/AzatJalilov/PelicanSdf) at commit
`63190d7e5fb883175b8612374de5e7f094293548` (observed 2026-11-05).

Included files:

| Fixture path | Source path | SHA-256 |
| --- | --- | --- |
| `manifest.json` | `data/manifest.json` | full manifest retained |
| `prompt.txt` | `benchmark/prompt.txt` | `cd21d5a8bb3956d82ab5650304e7e491063eacdb27dad85be6b4a845512f5e6b` |
| `results/gpt-6-1-sol-high-run-01.json` | `data/results/gpt-6-1-sol-high-run-01.json` | study record retained |
| `artifacts/gpt-6-1-sol-high-run-01.js` | `data/artifacts/gpt-6-1-sol-high-run-01.js` | `f045557dcef3f8968d17db25453f5caa34ba3a9ecaed7d9caa64a2366a24bc1c` |
| `thumbnails/gpt-6-1-sol-high-run-01.jpg` | `assets/thumbnails/gpt-6-1-sol-high-run-01.jpg` | `d77c45293bcb421f7d288400c497f8b1d8b44d470ea3be4ea05f681e69c1d73d` |
| `LICENSE` | `LICENSE` | MIT, Copyright (c) 2026 Pelican SDF contributors |

The fixture exists to test parsing, hash verification, storage and packaging. It
does **not** establish permission to republish the generated artifact or the
upstream model output. The repository's MIT license covers the repository's
software; the study records separately describe a subscription-based model
invocation. A real source approval therefore needs a recorded rights decision
for the artifact and the upstream provider terms, not just the MIT file.

The showcase importer stores source and revision rights independently and fails
closed until an operator records an approved decision with all display, cache
and redistribution flags. The fixture tests use a synthetic approved decision
only to exercise the publication mechanism.
