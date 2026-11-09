# The demo script

**Samba Stack Overflow: find your talk, find your people.**

This is a script you can read out loud. Lines marked **Say** are yours to
speak; lines marked **Do** are what to click. It runs about three and a half
minutes. Parts marked *(optional)* can go if you are short on time.

The story in one sentence: *I built a conference app in an afternoon, and
four tools kept me honest while I did it.*

## Before you hit record

Open these tabs, in this order:

| # | Tab | Where |
|---|---|---|
| 1 | The app | https://samba-stack-overflow.cnh.radarhq.io |
| 2 | Dash0 | Dashboards > "Samba Stack Overflow: search health" |
| 3 | Radar | https://app.radarhq.io > cluster `samba-stack-overflow` > Timeline |
| 4 | Radar | AI investigations > the run on Deployment `app` |
| 5 | Radar | Checks, with Namespace set to `team-samba-stack-overflow` |
| 6 | GitHub | https://github.com/eduardovpessoa/samba-stack-overflow/pulls?q=is%3Apr |

And have ready:

- The **ops token**: the `OPS_TOKEN` line in `.env.local`. Copy it before
  recording so it is never on screen.
- Your **phone**, with the app open, if you want to show it installed.
- A clean setlist: open the app and remove any talks left from testing.
- **Nothing personal on screen.** Radar Cloud shows your email at the bottom
  of its sidebar: collapse the sidebar with the « button first. Check Dash0
  for the same. Never show `.env`, `.env.local` or a terminal with tokens.

## Scene 1. Hello (20 seconds)

**Say:**
> "Conferences are full of great talks, and somehow you still miss the one
> you came for. This is Samba Stack Overflow. It finds your talk and your
> people, and it shows its work. I'm Brazilian, so your agenda is a
> *setlist*, and your people are a *roda*: the circle where samba happens.
> In a roda nobody is the audience. Everybody is in the band."

## Scene 2. Find the talk (60 seconds)

**Do:** type *How do I stop getting woken up at 3am by useless pages?* and
press **Bora!** ("let's go").

**Say:**
> "I asked like a tired human, not like a search engine. The top result is
> 'From Alert Fatigue to Signal'. None of my words are in that title.
> Elasticsearch ran two searches at once: one that reads my words, and one
> that understands what I mean. Then it blended the two rankings. See these
> chips? Keyword number one, Meaning number one. They agree."

**Do:** type *People who cannot hear should still be able to follow my
presentation*.

**Say:**
> "Now they disagree. Keywords alone would put this talk fifth. Meaning puts
> it first: 'Sign Language Interpreters and You'. And every card tells you
> why it matched, in plain words. No magic, no trust me."

**Do:** tick **Captions** and **Step-free access**.

**Say:**
> "These filters only show talks where the organisers confirmed it. When
> they have not said, the app says 'Not published'. It never guesses. If you
> use a wheelchair, a guess is worse than no answer."

**Do:** add two or three talks to the setlist, then press **Fill my free
time**.

**Say:**
> "This is my favourite part. One question to Elasticsearch: find talks like
> the ones I picked, *and* only at times when I am free. The meaning search
> does the ranking, date ranges do the calendar. One query, zero clashes."

**Do:** press **Share setlist** and paste the link into a new tab (or open
it on your phone).

**Say:**
> "My setlist is now saved in Elasticsearch, and this link opens it
> anywhere. Send it to the friend who always asks 'what are you going to?'"

*(optional)* **Do:** open **Roda** and paste *I'm building an AI-powered
healthcare scheduling platform using Go, Kubernetes, and PostgreSQL.*

**Say:**
> "And this finds people building things like mine. These are demo profiles,
> clearly labelled. I did not invent real attendees."

## Scene 3. Break it on purpose (45 seconds)

**Do:** point at the line under the result count: *Elasticsearch · Hybrid ·
4 round trips*.

**Say:**
> "Every search tells you how much work it took: four trips to
> Elasticsearch. Now watch me break it."

**Do:** open **Ops** in the footer, paste the ops token, switch on the
practice incident, and search again.

**Say:**
> "Fifteen round trips. This is a classic bug called N plus one. Imagine
> ordering coffee for fifteen people by walking to the counter fifteen
> times. The app still works, it is only a little slower here, about 390 to
> 560 milliseconds. On bad wifi it was three times slower. That is why I
> count the trips and not only the seconds: you can see the bug before your
> users feel it."

**Do:** switch to the Dash0 dashboard and point at the round trips panel.

**Say:**
> "Dash0 sees the same jump, from every pod. I asked its AI, Agent0, what
> was going on. It compared a slow search with a fast one and found the
> extra calls, with trace IDs. It also found something I had not asked
> about: two requests that failed because they arrived a fifth of a second
> before the app was ready. That was a real gap. Now the app tells you when
> to retry, and retries by itself. And there is an alert on this number, so
> the bug cannot come back quietly."

**Do:** switch the incident off.

## Scene 4. Ask the cluster (40 seconds)

**Do:** show the Radar Timeline.

**Say:**
> "The app runs on Kubernetes. Every time I merge, GitHub builds it and Argo
> CD rolls it out, healthy in about thirty seconds each time. I read all of
> this from my coding agent, through Radar."

**Do:** open the AI investigation.

**Say:**
> "I asked Radar's AI to check my first release. Verdict: healthy. But it
> spotted a warning on a perfectly healthy start. So I asked a follow-up:
> which of your findings actually matter for an app this size? It told me
> which two were real risks and which one could wait."

**Do:** show the Checks page next to `docs/evidence/radar-checks-before-1.png`.

**Say:**
> "Three findings on my app before. Zero now."

*(optional)* **Say:**
> "The best part: after the fix, Radar showed one *new* warning. Radar gave
> me the symptom. Dash0 gave me the cause: the first connection from a new
> pod took 2.7 seconds. Two tools, one answer, one line of fix."

## Scene 5. Never merge broken (30 seconds)

**Do:** open pull request #1 on GitHub.

**Say:**
> "Nothing reached this cluster without a pull request, and Gitar reviewed
> every one against rules I wrote for this project. On the first one it
> found a security hole: my 'break it' switch was open to the whole
> internet. Fixed. It found an accessibility bug and pushed that fix itself."

**Do:** open pull request #2.

**Say:**
> "It even reviewed this script. I had written two numbers that could not
> both be true, and it called me out. I have been fact-checked by my own
> code reviewer."

## Scene 6. Goodbye (15 seconds)

*(optional)* **Do:** hold up your phone with the app installed.

**Say:**
> "It installs on your phone like an app, and it can remind you ten minutes
> before a talk. Better discovery, honest accessibility information, real
> connections, and the engineering to keep it standing. Samba Stack
> Overflow. *Obrigado!*"

## If a judge asks

| Question | Honest answer |
|---|---|
| Is the schedule real? | No. It is an openly labelled demo dataset of 42 talks and 18 profiles. The search, the cluster and the telemetry are all real. |
| Where is the data stored? | Everything is in Elasticsearch: talks, profiles, shared setlists and the incident switch. There is no other database. |
| What does "hybrid" mean? | Two searches per question, a keyword one and a semantic one on Jina embeddings, fused by Elasticsearch with reciprocal rank fusion. |
| Is the incident fake? | The switch is on purpose, the slowdown is real: the code makes one Elasticsearch call per result instead of one for all. It turns itself off after ten minutes and needs a token. |
| Are the notifications push? | No. They are reminders the app schedules itself, so they work while it is open or recently in the background. Push to a closed app would need a push server. |
| Does "Ask" work? | The code is there, but it is switched off: no language model key is configured on the cluster. |
| What did the AI tools actually change? | Gitar: a security fix and an accessibility fix on PR #1, a wrong number in this script on PR #2. Dash0 Agent0: retry hints on 503s. Radar: three hardening fixes and a probe delay, PRs #3 and #4. |

## The pull requests, in story order

| PR | What it shows |
|---|---|
| [#1](https://github.com/eduardovpessoa/samba-stack-overflow/pull/1) | The product. Gitar found a security hole and an accessibility bug. |
| [#2](https://github.com/eduardovpessoa/samba-stack-overflow/pull/2) | This script. Gitar caught two numbers that contradicted each other. |
| [#3](https://github.com/eduardovpessoa/samba-stack-overflow/pull/3) | Radar's findings fixed. Checks went from 3 to 0. |
| [#4](https://github.com/eduardovpessoa/samba-stack-overflow/pull/4) | Probe timing, set from a Dash0 measurement after Radar showed the warning. |
| [#5](https://github.com/eduardovpessoa/samba-stack-overflow/pull/5) | The before and after of three releases, written down. |
| [#6](https://github.com/eduardovpessoa/samba-stack-overflow/pull/6) | Shared setlists, "Fill my free time", visible round trips, and the installable app. |

The long versions, with times, numbers and the AI tools' own words, are in
`docs/investigations/`.

## If something breaks while recording

- Search is slow or down: say so and open the Dash0 dashboard. That is the
  point of the demo.
- The live site is unreachable: run it locally (`README.md`, "Run it
  locally") and carry on from Scene 2.
- A number on screen differs from this script: read the screen, not the
  script.

## Words, in plain language

- **Hybrid search**: asking the same question two ways, by exact words and
  by meaning, and blending the answers.
- **Embedding**: a list of numbers that stands for the meaning of a text, so
  similar ideas end up close together.
- **Round trip**: one request from the app to Elasticsearch and back.
- **N+1**: doing one request per item instead of one request for all items.
- **Pod**: one running copy of the app. There are two, on two machines.
- **Rollout**: replacing the old copies with new ones, one at a time.
- **Trace**: the recorded path of one request through the system.
- **Setlist**: your personal agenda. **Roda**: the people-finder.

## What is true today

Only claim what is ticked.

- [x] Elasticsearch: real index, hybrid search, semantic highlights, facets,
      people matching
- [x] Dash0: traces, metrics and logs from both cluster pods; browser
      monitoring from the deployed site
- [x] Dash0: dashboard and an alert rule on round trips, both kept in git
- [x] Dash0: Agent0 investigation through MCP, with a shipped fix
- [x] Dash0: practice incident on the cluster shows 4 round trips becoming 15
- [x] Radar: app deployed in the team cluster through Argo CD (two pods on
      two nodes, live at the public URL)
- [x] Radar: timeline, issues, Checks and diagnosis read through Radar's MCP
      server while shipping
- [x] Radar: hosted AI investigation on Deployment `app` (healthy, certainty
      established), with a follow-up that ranked the Checks findings
- [x] Radar: Checks findings in our namespace went from 3 to 0
- [x] Radar and Dash0 together: a readiness warning seen in Radar, explained
      by a Dash0 trace, fixed in pull request #4; the next rollout was clean
- [x] Gitar: every change landed through a reviewed pull request; real
      findings on #1 and #2, one fixed by a commit Gitar pushed
