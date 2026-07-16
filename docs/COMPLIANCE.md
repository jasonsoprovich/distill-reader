# Copyright & Legal Compliance Research

> Product-planning risk research, not legal advice. Written for the solo-developer stage of Distill; **get real legal counsel before commercial/multi-user launch** (see §10.7 of `PLAN.md`) — this is directional, not a substitute.

Researched via a multi-agent, adversarially-verified search (19 sources fetched, 77 candidate claims extracted, 25 claims triple-vote-verified). Every claim below is tagged with a confidence level based on how it survived that verification:

- **Confirmed** — 3/3 or 2/3 independent verifiers checked it against the primary source and found it accurate.
- **Plausible** — supported by a secondary/commentary source but didn't cleanly survive adversarial re-verification (usually because the claim over-generalized a narrower holding). Treat as "likely true in substance, verify the specifics before relying on it."

---

## 1. Is fetching feeds, extracting full text, and storing it legal?

**It depends heavily on whether you're extracting *more* than the publisher chose to put in their own feed.**

- **Confirmed** — Fair use (17 U.S.C. §107) turns on four factors: purpose/character of the use (including commercial nature and whether it's "transformative"), nature of the work, amount/substantiality used, and market effect. There's no bright-line safe percentage — every case is fact-specific. ([copyright.gov/fair-use](https://www.copyright.gov/fair-use/))
- **Confirmed** — In *Field v. Google* (D. Nev. 2006), the court held Google's caching of a site owner's full page text was protected because the owner *knew how to block it* (via `robots.txt` / a `noarchive` meta tag) and chose not to — his inaction was treated as an **implied license**. ([Wikipedia summary](https://en.wikipedia.org/wiki/Field_v._Google,_Inc.))
- **Confirmed** — In *Associated Press v. Meltwater* (S.D.N.Y. 2013), the court found Meltwater's commercial news-monitoring service **not transformative**: it auto-captured and republished text segments (4.5%–61% of each article, including the lede — "the heart of the story") without adding commentary, for direct commercial gain. The court rejected Meltwater's fair-use defense. *(Plausible, not confirmed, that this generalizes to "all automated aggregation is per se not fair use" — one verifier flagged that as overreach from a single, never-appealed, settled SDNY ruling.)* ([copyright.gov summary](https://www.copyright.gov/fair-use/summaries/ap-meltwater-sdny2013.pdf))
- **Plausible** — *MidlevelU, Inc. v. ACI Information Group* (11th Cir., 2021): a publisher making content available via RSS feed can create an implied license, but that license runs to **individual/personal subscriber use**, not to a third party commercially re-aggregating or republishing it. (Didn't cleanly survive re-verification, but is consistent with the *Field* and *Meltwater* reasoning above.)
- **Confirmed (real-world enforcement, not a court ruling)** — In 2010, the *New York Times* sent a DMCA takedown notice against the paid **Pulse** RSS reader app, asserting that displaying NYTimes.com/Boston.com feeds was unlicensed "commercial use" under the feed's Terms of Use. Apple pulled Pulse from the App Store over it (restored after Pulse adjusted). This shows publishers *do* assert rights even against apps that only display what's already in the public feed. ([Nieman Lab](https://www.niemanlab.org/2010/06/can-loading-a-feed-into-an-rss-reader-be-grounds-for-legal-action/))

**Practical read for Distill:** Displaying exactly what a feed publishes — even a full-text feed — for a subscribing user is the safest end of the spectrum (this is what Feedly/Inoreader/NetNewsWire/Reeder already do, and it tracks the *Field* implied-license logic). Your plan's current default (§5.3: "always resolve the canonical URL and run readability-grade extraction, even when the feed already provides content") is the riskier end — it bypasses a length limit the publisher deliberately set, which is structurally the closest thing in this research to what Meltwater lost on. Many of your pre-seeded sources (Krebs, Dark Reading, BleepingComputer, The Hacker News) already publish full or near-full text in their own feeds, so extracting from *them* isn't materially different from what the feed already offers. The exposure is specifically for **feeds that intentionally publish a short excerpt** — extracting the full site content there is the one place I'd flag for a product decision (see §5 below).

---

## 2. Does charging a subscription fee change the analysis?

Not disqualifying by itself — Feedly, Inoreader, and others operate commercially. But **commercial nature is explicitly one of the four fair-use factors**, and it's the factor *Meltwater* was penalized on. It doesn't independently create liability; it removes one of your best fair-use arguments once another risk factor (e.g., full-text extraction beyond the feed's own excerpt) is already present. Feedly's own API Terms of Service require third-party apps built on their platform to push users to a paid Feedly account rather than allow free-tier commercial redistribution — evidence that incumbents treat "commercial + redistribution" as something to license/gate, not leave open. ([Feedly API ToS](https://developers.feedly.com/reference/feedly-api-terms-of-service))

**Practical read:** monetizing isn't the problem; monetizing *on top of* full-text extraction that exceeds the feed's own excerpt is where risk compounds.

---

## 3. Are AI summaries and TTS narration a different risk category?

**Yes — and this is a live, unsettled area of litigation as of 2025–2026, not old case law.**

- A 2025 S.D.N.Y. ruling (Judge Colleen McMahon) held that AI-generated **"substitutive summaries"** — ones that mirror an article's expressive structure and storytelling choices, even without verbatim copying — may plausibly infringe. A pure word-count/quantitative comparison isn't sufficient to clear a summary. ([Copyright Lately](https://copyrightlately.com/court-rules-ai-news-summaries-may-infringe-copyright/))
- Ongoing publisher litigation (Chicago Tribune, NYT, others vs. Perplexity-style RAG products) alleges AI outputs go beyond fair summarization into near-copying / substitutive summarization. ([Copyright Alliance tracker](https://copyrightalliance.org/ai-copyright-lawsuit-developments-2025/))
- Legal commentary explicitly draws the line back to *Meltwater*'s "expressive substitution" reasoning as the applicable precedent for AI-generated news abstracts. ([Tech Policy Press](https://www.techpolicy.press/the-missing-fair-use-argument-in-the-copyright-battle-over-ai-summaries/))
- Separately, in 2025–2026 a major publisher trade body (Digital Content Next) sent Common Crawl a cease-and-desist demanding it stop retaining and sharing scraped copyrighted content — a sign publishers are currently enforcing aggressively against *any* AI/scraping-adjacent retention, not just direct republication. ([Press Gazette](https://pressgazette.co.uk/media_law/common-crawl-ai-news-publishers-scraping-cease-and-desist-letter/))

**No case law was found specifically on TTS narration of article text or of AI summaries** — this is an unresearched edge case. Reasoning by analogy: TTS of the **full article** is functionally a full audio reproduction of the copyrighted text, so it should be treated as inheriting the *same* risk tier as full-text caching/display — not a separate, lower-risk category just because it's audio instead of text. TTS of your **AI summary** inherits whatever risk the summary carries, plus adds another derivative-work layer on top.

**Practical read for Distill:** keep AI summaries short and structurally distinct from the source article (don't mirror its paragraph/narrative order) — the 2025 ruling specifically flags structural mirroring, not just excerpt length. The summary-vs-full toggle we just added to TTS/RSVP (§7.2/§8.4 of `PLAN.md`) is a good mitigation for cost *and* for legal exposure: letting the default lean toward summary-only narration for publishers/feeds you're less sure about is defensible product design, not just a UX nicety.

---

## 4. Is offline access / local export legally distinct from caching?

No distinct case law was found treating "cache for on-demand serving" differently from "download/export a local copy." Industry ToS review (Feedly, Inoreader) didn't surface explicit provisions distinguishing the two either. The practical read: offline export is an additional **copy at rest**, which raises the same retention/redistribution risk as caching, just concentrated in a form that's easier to leak or share outside your access controls. It doesn't need separate legal treatment — it needs the **same** access-control and retention discipline you already require in `PLAN.md` §10 (auth-scoped access, no public exposure, purge on retention expiry) applied consistently to any exported copies too.

---

## 5. Industry practice / what keeps commercial readers defensible

- Respect the publisher's own technical opt-out signals (`robots.txt`, `noarchive` meta tags) — this is the exact mechanism *Field v. Google* turned on. Build the mirror image: give publishers/feed owners an easy way to ask you to stop indexing them, and honor it.
- **DMCA §512 safe harbor is not automatic.** To qualify, a service provider must proactively (a) adopt and post a repeat-infringer/takedown policy and (b) register a designated agent with the U.S. Copyright Office, before it can require infringement claims to route through that formal process. Do this before commercial launch — it's cheap and fast, and its absence is a real (not theoretical) gap right now.
- Always link to the original article prominently; never strip or alter author/publication attribution. Every source reviewed treats "market substitution without linking back" as an aggravating factor and "always link out" as standard practice among existing readers.
- Honor DMCA takedown notices promptly, with a real, monitored abuse/legal contact.

---

## 6. Bottom line — risk ranking for Distill's current architecture

| Practice | Risk | Why |
|---|---|---|
| Displaying exactly what a feed publishes (even full-text), for a subscribing user | **Low** | Matches *Field v. Google* implied-license logic; what every mainstream reader already does |
| Full-text extraction from sources whose own feed is already full-text (Krebs, Dark Reading, BleepingComputer, The Hacker News, HN-linked articles generally) | **Low–Medium** | Not meaningfully different from what the feed offers |
| Full-text extraction that **bypasses a feed's own intentional excerpt/truncation** | **Medium–High** | Structurally closest to what *Meltwater* lost on — the single biggest exposure in the current plan |
| Charging a subscription fee | **Neutral on its own, multiplies whatever tier you're already in** | Commercial nature is a fair-use factor, not an independent violation |
| Short, structurally-transformed AI summaries, clearly labeled | **Low–Medium** | Some exposure under the 2025 "substitutive summary" line of cases, but materially lower than long/structure-mirroring summaries |
| TTS narration of full article text | **Same tier as full-text caching/display** | Audio doesn't lower the exposure of reproducing the full text |
| Offline export / local copies | **Inherits the caching tier** | Same governance (access control, retention) applies, no separate legal category found |

---

## 7. Plain-English action checklist before commercial launch

1. Respect `robots.txt` and feed-level excerpt/truncation choices by default; treat "extract full text beyond what the feed publishes" as a conscious per-source decision, not a silent blanket default (see open decision below).
2. Give publishers/feed owners an easy, honored opt-out ("stop indexing me").
3. Register a DMCA §512 designated agent and post a takedown policy before charging money for the service.
4. Always link prominently to the original article; never strip attribution.
5. Keep AI summaries short and structurally distinct from the source (don't mirror paragraph order/narrative structure); label them clearly as AI-generated.
6. Treat full-article TTS narration as carrying the same exposure as full-text display/caching, not a lesser one.
7. Apply the same access-control/retention rules to offline/exported copies as to cached copies.
8. **Get an actual lawyer before flipping to public/multi-user/paid hosting** (§10.7) — this area (AI-summary copyright litigation especially) is moving fast in 2025–2026 courts, and full-text extraction beyond a feed's excerpt is a real, not hypothetical, point of exposure once you're a commercial entity a publisher's counsel could plausibly find.

---

## Open product decision surfaced by this research

`PLAN.md` §5.3 currently has full-text extraction run unconditionally, "even when a feed provides `contentHtml`." Given the above, worth deciding: should extraction beyond the feed's own published length be **opt-in per source** (or limited to sources with a known full-text feed) rather than the default for every added feed? Flagging this rather than changing it — it's a product/risk-tolerance call, not a technical one.

## Research limitations

The automated research workflow's final synthesis step failed after hitting a session rate limit (23 of 101 sub-agent calls errored during the last verification/synthesis batch — mostly re-verification of claims that were already confirmed by their first 1–2 votes, plus the synthesis pass itself). This document was hand-synthesized from the 9 fully-confirmed claims, several plausible-but-not-fully-reverified claims, and the raw source extractions, rather than from an automated synthesis pass. The underlying source list and claim-level verification detail is preserved in the workflow transcript if deeper citation-checking is needed later.
