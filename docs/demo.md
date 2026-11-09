# Three-minute demo

One story, not four product tours: **a talk finder, and the afternoon it took
to make it trustworthy.**

Open these tabs before you start:

1. The app: https://samba-stack-overflow.cnh.radarhq.io
2. Dash0: the dashboard "Samba Stack Overflow: search health"
3. Radar Cloud: cluster `samba-stack-overflow`, the `app` Deployment
4. GitHub: the pull request list of this repo

## 0:00 Opening (20 s)

> "Conference days are full of great talks, and you still miss the one you
> came for. Samba Stack Overflow finds your talk and your people, and shows
> its work. I'm Brazilian, so your agenda is a setlist and your people are a
> roda, the circle where samba happens."

## 0:20 The product, on Elasticsearch (55 s)

1. Type: *"How do I stop getting woken up at 3am by useless pages?"*
   The top result is **"From Alert Fatigue to Signal"**. Point at the chips:
   **Meaning #1, Keyword #3**. "None of my words are in that title.
   Elasticsearch ran a keyword query and a semantic query on Jina embeddings
   and fused them with reciprocal rank fusion. The card says why it matched."
2. Click the chip *"I'm a backend dev, new to eBPF"*. "It read 'new to' and
   lifted the beginner sessions."
3. Tick **Captions** and **Step-free access**. "Only talks where the
   organisers confirmed it. Unknown says 'Not published'. We never guess."
4. Add two overlapping talks. The **Setlist** flags the clash. "Add to
   calendar" exports it.
5. Open **Roda**, paste *"I'm building an AI-powered healthcare scheduling
   platform using Go, Kubernetes, and PostgreSQL."* "Vector search over demo
   profiles, labelled as demo."

## 1:15 Observability, with Dash0 (40 s)

1. Open the **Ops** drawer in the footer, paste the ops token (`OPS_TOKEN` in
   `.env.local`) and switch on the practice incident. Search three times.
2. Dash0 dashboard: the **Elasticsearch round trips** panel jumps from 4 to
   15. Be honest about latency: inside the cluster each extra round trip
   costs about 14 ms, so searches only go from about 500 ms to 560 ms. From
   a slow network the same bug tripled it (0.85 s to 2.5 s). "That is why we
   chart round trips and not only latency: the bug is there before users
   feel it."
3. Show `docs/investigations/2026-11-09-dash0-agent0-slow-search.md`.
   "I asked Agent0 through Dash0's MCP server. It compared a slow and a fast
   trace of the same query and found 12 sequential Elasticsearch calls where
   there should be one: 1.87 s against 0.16 s. It also explained two failed
   requests I had not asked about in detail: they hit the service 0.2 s
   before its index was ready. That one was a real gap, and the fix shipped:
   every 503 now says when to retry, and the app retries by itself."
4. Switch the incident off. The panel drops back.

## 1:55 Kubernetes, with Radar (35 s)

1. Radar Cloud, the `app` Deployment: "Every push to main is built by GitHub
   Actions and rolled out by Argo CD. This is the timeline of today."
2. Open the AI investigation. Say what it found and what you did.
   <!-- Fill in after the investigation: resource, root cause, fix. -->
3. Show **Checks** before and after.

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
- [x] Radar: app deployed in the team cluster through Argo CD (version
      `7458f9a`, two pods, live at the public URL)
- [ ] Radar: AI investigation run on a real issue
- [x] Gitar: pull request #1 reviewed against the project's rules; two real
      findings, one fixed by hand and one by a commit Gitar pushed; area
      labels and the deploy reminder applied by repository rules
