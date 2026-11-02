# aggroNATION content sources

Extracted 2026-11-02 from `resources/aggroNATION-main` plus live feed probes.

**Important boundary:** the old site's sources were rows in Supabase, created
through its admin UI. The repository is not a database export. It commits one
operator registration script, six exact sources, and references to other source
names in its FIDs. The old deployment (`aggro-nation.vercel.app`) returns 404
and the Wayback Machine has no snapshot, so source rows that were never
committed cannot be recovered from the code.

## 1. Exact sources committed in the repo

Source: `scripts/register-operator-sources.ts` (2026-09-04). These six are the
operator-requested registrations, idempotent on URL.

| Old label | Old type | Committed URL | Savant kind | Live parser probe |
|---|---|---|---|---|
| Hacker News | `rss` | `https://hnrss.org/frontpage` | `rss` | 20 items, `article` |
| HuggingFace Daily Papers | `huggingface` | `https://huggingface.co/papers` | — | **Unsupported**: old fetcher read `https://huggingface.co/api/daily_papers` JSON; Savant has no HuggingFace fetcher |
| Open Source Projects | `opensource` | `https://www.opensourceprojects.dev/rss` | `rss` | 12 items, `repo` with tag `repository` |
| Trendshift | `trendshift` | `https://trendshift.io/?sort=views` | — | **Unsupported**: HTML scraper; the site publishes no feed |
| r/AI_Agents | `reddit` | `https://www.reddit.com/r/AI_Agents/hot.rss` | `rss` | 20 items, `discussion`; Reddit rate-limits |
| r/singularity | `reddit` | `https://www.reddit.com/r/singularity/hot.rss` | `rss` | HTTP 429 at extraction time; retry later |

The four `rss`-compatible rows can be created in **Admin → Content** today.
HuggingFace and Trendshift need a new fetcher before they can be represented
honestly; do not register them as RSS.

## 2. Source names evidenced in FIDs, URLs not committed

These names appear in the old site's source-badge/session evidence. The exact
registered URLs were not committed. The canonical feed URLs below were probed
live on 2026-11-02 and returned valid feeds, but they are **inferred**, not an
export of the old `sources` table.

| Old source name | Canonical feed URL | Kind | Live parser probe |
|---|---|---|---|
| OpenAI / OpenAI News | `https://openai.com/news/rss.xml` | `rss` | 20 items, `article`; `openai.com/blog/rss.xml` redirects here — add one, not two |
| HF Blog | `https://huggingface.co/blog/feed.xml` | `rss` | 20 items, `article` |
| arXiv cs.AI | `https://rss.arxiv.org/rss/cs.AI` | `rss` | 20 items, `paper`; the `arxiv.org` path redirects and can return an empty channel snapshot |
| Google AI Blog | `https://blog.google/technology/ai/rss/` | `rss` | 20 items; classified `paper` by the title/tag heuristic |

The parser probe used Savant's own `parseFeed` with a 20-item cap. Production
clamps per-source `maxItems` to 50. The manifest uses 50 so the feed cap does
not truncate what the old site allowed.

The old site also mentioned `r/BlackboxAI_` and `r/vibecoding`; both returned
429 at extraction time.

## 3. YouTube channels: not recoverable from the repo

The old audit recorded **13 active YouTube channels**; a later CHANGELOG entry
mentions **14**. The channel rows lived in Supabase and were never committed.
The only channel identifier anywhere in the repo is from a live-fetch
verification, not a source export:

- `@TwoMinutePapers` / channel id `UCbfYPyITQ-7l4upoX8nvctg`
  (`FID-2026-0903-003-youtube-fetch-pipeline.md`)

That is evidence the channel could be fetched, not proof it was one of the
operator's 13.

Your current Savant instance already has two YouTube sources, observed
read-only from `/signal?kind=video`: `WorldofAI` and `airevolutionx`. The
remaining channels need the old database.

### How to recover the missing rows

If the old Supabase project is still accessible, export the unarchived sources:

```sql
select type, name, url, config
from sources
where archived = false
order by type, name;
```

or from the Supabase dashboard: **Table editor → sources → Export CSV**.

Send that export (or paste the rows) and the channel URLs/handles can be
mapped to Savant `youtube` sources. A `UC…` channel id works without
`YOUTUBE_API_KEY`; an `@handle` needs the key for resolution.

## 4. Import notes

- Savant supports only `kind: "rss"` and `kind: "youtube"`. The old
  `reddit`, `huggingface`, `trendshift`, and `opensource` types do not exist.
- Reddit feeds are ordinary Atom and work as `rss`, but Reddit returns 429
  intermittently. Ingestion records the failure and retries on the next fetch.
- Open Source Projects is an RSS feed. Add the tag `repository` so Savant's
  `inferKind` classifies its items as repositories rather than articles.
- Old HuggingFace items came from a JSON API and old Trendshift items from an
  HTML scraper. Neither can be imported as an RSS source without a new fetcher.
- The old X/Twitter sources are deliberately excluded: X support was removed
  from the old site, and its free read tier no longer exists.

A machine-readable version of the importable rows is in
[`aggronation-sources.json`](aggronation-sources.json).
