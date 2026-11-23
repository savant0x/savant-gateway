# Content-to-model matching

A Signal item ("content") links to a catalog model when the matcher proves the
model is named in the item. That link is a product claim — the reader is told
"these models are in this piece" — so the matcher is literal and measured, never
semantic and never inferred from a family name.

## Where it lives

| File | Role |
| --- | --- |
| `lib/content/model-aliases.ts` | Turns a catalog row into the phrases it may be recognised by |
| `lib/content/link-scan.ts` | Finds those phrases in a tokenized text and applies the precision rules |
| `lib/content/linking.ts` | Public entry: `suggestModelLinks`, `inferRelation`, evidence ranking |
| `lib/content/link-groups.ts` | Read-time grouping so one model renders one card |
| `lib/content/store/match-stored-item.ts` | The only stored writer path, under the matching policy |
| `lib/content/store/link-writes.ts` | Link state and the append-only decision log |

## What a model may be called

Three literal strings identify a row: the last segment of its id, its display
name and the last segment of its upstream id. Two more families of phrase are
derived from `family` so a headline can write the name the way people do:

- `opus 4 6 thinking` — the descriptor with its version, so "Sonnet 4.5 is
  Anthropic's best" links `claude-sonnet-4.5` without the vendor prefix.
- `claude 4 6 opus` — the version before the descriptor, so "Claude 4.6 Opus
  ships" links at all.
- `claude 4 6` — family plus version only. This is **weak** evidence.

A single-token id links only when it carries a digit (`hy3`, `o3`). An id without
a version links when its phrase has at least two tokens (`deepseek-flash`).

## Three rules that keep precision

1. **Longest match at a position wins.** `GLM-5.3` in a headline does not also
   link `GLM-5`, and `Kimi K2.5 Thinking` does not also link plain `Kimi K2.5`.
   Suppression is positional and same-family, so "Kimi K2.5 and Kimi K2.5
   Thinking both ship" still links both.
2. **A version must not continue.** `GLM-5` does not match `GLM-5.7`: when the
   alias ends in numerals and the next token is numeric, the version differs.
3. **A weak phrase must be unambiguous.** If two different models produce the
   same family+version phrase at the same place, neither is linked. One model
   sold under several provider prefixes shares its key and survives the rule.

## Evidence and confidence

| Evidence | Confidence | Auto-publishable |
| --- | --- | --- |
| Title | 1.00 | Only with `autoPublish`, a versioned non-weak phrase |
| Exact tag | 0.85 | No |
| Excerpt | 0.70 | No |
| Body / video description | 0.70 | No |

Body matching covers every kind (articles, papers, repositories, videos) inside
the same bounded window used for YouTube descriptions; the operator setting
`matchBodyText: false` disables it, and `matchYouTubeDescriptions: false` keeps
its original YouTube-only meaning.

## One card per model

`content.model_links` records the exact catalog row that matched — provider
prefix included — because that is the evidence. The reader sees one card per
underlying model: `groupLinkedModels` folds rows that share
`canonicalModelKey`, quotes the cheapest one, and names the other providers. A
link whose catalog row disappeared still renders, marked "not currently sold
here", instead of vanishing from the page.

## Measuring it

`tests/content-link-eval.test.mjs` runs `tests/fixtures/content-link-eval.json`:
labelled headlines, each naming the provider-neutral model keys it must link and
the keys it must not. The test asserts exact sets, not "at least one", and prints
the recall and precision counts on failure.

When a bad link is found in the wild, add the headline to the fixture. The corpus
is the regression test; it is not a snapshot to be edited until it passes.

```bash
node --test tests/content-link-eval.test.mjs
```

## What this does not do

- No fuzzy score, no embedding, no family-only match. A headline that names no
  model ("OpenAI's new model tops the leaderboard") links nothing, by design.
- Near-miss candidates (a family+version phrase that is close but not proven) are
  not generated yet. That work is registered as IA11 in `SCOPE.md` and needs its
  own review queue so nothing unproven is published.
