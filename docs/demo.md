# Three-minute demo

One story, not four product tours: **a talk finder, and the afternoon it took
to make it trustworthy.**

Open these tabs before you start recording:

| Tab | What to open |
|---|---|
| App | https://samba-stack-overflow.cnh.radarhq.io |
| Dash0 | Dashboards > "Samba Stack Overflow: search health" |
| Radar, timeline | https://app.radarhq.io > cluster `samba-stack-overflow` > Timeline |
| Radar, investigation | AI investigations > the run on Deployment `app` |
| Radar, Checks | Checks, with Namespace set to `team-samba-stack-overflow` |
| GitHub | https://github.com/eduardovpessoa/samba-stack-overflow/pulls?q=is%3Apr |
| Reports | `docs/investigations/` (one for Dash0, one for Radar) and `docs/evidence/` |

The pull requests, in the order they tell the story:

| PR | What it shows |
|---|---|
| [#1](https://github.com/eduardovpessoa/samba-stack-overflow/pull/1) | The product. Gitar found a security hole and an accessibility bug; one fixed by hand, one by a commit Gitar pushed. |
| [#2](https://github.com/eduardovpessoa/samba-stack-overflow/pull/2) | This script. Gitar caught two numbers in it that contradicted each other. |
| [#3](https://github.com/eduardovpessoa/samba-stack-overflow/pull/3) | Radar's Checks findings fixed. Checks went from 3 to 0. |
| [#4](https://github.com/eduardovpessoa/samba-stack-overflow/pull/4) | Probe timing set from a Dash0 measurement, after Radar showed the warning. |

## 0:00 Opening (20 s)

> "Conference days are full of great talks, and you still miss the one you
> came for. Samba Stack Overflow finds your talk and your people, and shows
> its work. I'm Brazilian, so your agenda is a setlist and your people are a
> roda, the circle where samba happens."

## 0:20 The product, on Elasticsearch (55 s)

1. Type: *"How do I stop getting woken up at 3am by useless pages?"*
   The top result is **"From Alert Fatigue to Signal"**, chips **Keyword #1,
   Meaning #1**. "None of my words are in that title. Elasticsearch ran a
   keyword query and a semantic query on Jina embeddings and fused them with
   reciprocal rank fusion. Both agree here, and the card says why."
2. Type: *"People who cannot hear should still be able to follow my
   presentation"*. The top result is **"Sign Language Interpreters and
   You"**, chips **Meaning #1, Keyword #5**. "Keywords alone would have put
   this fifth. Meaning put it first."
3. Click the chip *"I'm a backend dev, new to eBPF"*. "It read 'new to' and
   lifted the beginner sessions."
4. Tick **Captions** and **Step-free access**. "Only talks where the
   organisers confirmed it. Unknown says 'Not published'. We never guess."
5. Add two overlapping talks. The **Setlist** flags the clash. "Add to
   calendar" exports it.
6. Open **Roda**, paste *"I'm building an AI-powered healthcare scheduling
   platform using Go, Kubernetes, and PostgreSQL."* "Vector search over demo
   profiles, labelled as demo."

## 1:15 Observability, with Dash0 (40 s)

1. Open the **Ops** drawer in the footer, paste the ops token (`OPS_TOKEN` in
   `.env.local`) and switch on the practice incident. Search three times.
2. Dash0 dashboard: the **Elasticsearch round trips** panel jumps from 4 to
   15. Be honest about latency: inside the cluster each extra round trip
   costs about 15 ms, so the same search goes from about 390 ms to about
   560 ms (11 extra round trips). From a slow network the same bug tripled
   it (0.85 s to 2.5 s). "That is why we chart round trips and not only
   latency: the bug is there before users feel it."
3. Show `docs/investigations/2026-11-09-dash0-agent0-slow-search.md`.
   "I asked Agent0 through Dash0's MCP server. It compared a slow and a fast
   trace of the same query and found 12 sequential Elasticsearch calls where
   there should be one: 1.87 s against 0.16 s. It also explained two failed
   requests I had not asked about in detail: they hit the service 0.2 s
   before its index was ready. That one was a real gap, and the fix shipped:
   every 503 now says when to retry, and the app retries by itself."
4. Switch the incident off. The panel drops back.

## 1:55 Kubernetes, with Radar (35 s)

Open tabs: Radar Cloud > **Timeline** (namespace
`team-samba-stack-overflow`), **AI investigations**, and **Checks**. The
full write-up with times and quotes is
`docs/investigations/2026-11-09-radar-first-release.md`.

1. **Timeline.** "Every push to main is built by GitHub Actions and rolled
   out by Argo CD. Here is the first release: the Application showed a
   ComparisonError because I created it before the code was merged, the
   merge cleared it, and 24 seconds after the sync both new pods were
   healthy. I read all of this through Radar's MCP server from my coding
   agent."
2. **AI investigation** on Deployment `app`. "I asked Radar's AI SRE to
   check the release. Verdict: healthy, certainty established. It still
   found something: a 'startup probe failed, connection refused' warning on
   a perfectly healthy start."
3. **The follow-up.** "I asked which of Radar's Checks findings actually
   matter for a two-replica web app. Its answer: the unused Kubernetes API
   token and the missing PodDisruptionBudget are real risks, the missing
   topology spread is a latent one, and the probe warning goes away with an
   initial delay."
4. **Checks, before and after.** Show `docs/evidence/radar-checks-before-1.png`
   next to the live Checks page with Namespace set to
   `team-samba-stack-overflow`. "Three findings on our Deployment before,
   zero now. The fixes went through pull request #3: Gitar reviewed it, Argo
   CD rolled it out in 32 seconds, and Radar shows the result."
5. **If you have ten more seconds, the best part.** "The after-check showed
   one new warning: readiness probe failed, 503. Radar gave me the symptom.
   Dash0's trace gave me the cause: the first connection from each new pod
   to Elasticsearch took 2.7 seconds, so warm-up ran past the probe. Two
   tools, one answer, and a one-line fix in pull request #4."

## 2:30 Code quality, with Gitar (20 s)

1. Open the pull request. "Every feature landed through a pull request that
   Gitar reviewed against this project's own rules: the API contract, no
   Elasticsearch call inside a loop, never invent accessibility data."
2. Show the two findings on pull request #1 and how each was closed:
   - **Security:** `POST /api/chaos` was open on a public URL, so anyone
     could keep the N+1 regression switched on. Fixed in `785f9be`: the
     switch now needs an ops token from the cluster Secret.
   - **Bug:** the Ask prompt passed only two of the four accessibility
     fields to the model, so it would guess or say "not published" wrongly.
     Gitar pushed that fix itself in `6d0d4c8` when asked.
3. Point at the labels (`area:search`, `area:deploy`, ...) and the deploy
   reminder comment: both come from this repo's own rules in `.gitar/rules/`.
4. A good closing line for this part, from pull request #2: "It even
   reviewed this demo script. I had written '14 milliseconds per round trip'
   next to '500 to 560 milliseconds', and it pointed out those cannot both
   be true. It was right: I had compared two different sets of queries."

## 2:50 Close (10 s)

> "Better discovery, honest accessibility information, real connections, and
> the engineering to keep it standing. Samba Stack Overflow. Obrigado!"

## If something breaks on stage

- Search is slow or down: say so, and open the Dash0 dashboard. It is the
  point of the demo.
- The cluster URL is unreachable: run it locally (`README.md`, "Run it
  locally") and continue from step 0:20.

## What is true today

Only claim what is ticked.

- [x] Elasticsearch: real index, hybrid search, semantic highlights, facets,
      people matching
- [x] Dash0: traces, metrics and logs received; dashboard created; Agent0
      investigation through MCP with a shipped fix
- [x] Dash0: telemetry from both cluster pods, with pod and namespace names
- [x] Dash0: browser monitoring from the deployed site (page views, LCP, CLS)
- [x] Dash0: practice incident on the cluster shows 4 round trips becoming 15
- [x] Radar: app deployed in the team cluster through Argo CD (two pods on
      two nodes, live at the public URL)
- [x] Radar: timeline, issues, Checks and diagnosis read through Radar's MCP
      server while shipping
- [x] Radar: hosted AI investigation on Deployment `app` (healthy, certainty
      established), with a follow-up that ranked the Checks findings
- [x] Radar: Checks findings in our namespace went from 3 to 0 after pull
      request #3
- [x] Gitar: pull request #1 reviewed against the project's rules; two real
      findings, one fixed by hand and one by a commit Gitar pushed; area
      labels and the deploy reminder applied by repository rules
