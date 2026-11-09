# Radar: the first release, investigated

- **When:** 2026-11-09, right after version `7458f9a` replaced the starter app
- **Where:** cluster `samba-stack-overflow`, namespace `team-samba-stack-overflow`
- **How:** Radar Cloud's MCP server from the coding agent (`issues`,
  `get_changes`, `diagnose`, `get_cluster_audit`), then a hosted AI
  investigation on Deployment `app` (`start_investigation`, with one
  follow-up question)
- **Radar link:** the investigation is private to the account that started
  it; open it from Radar Cloud > AI investigations

## 1. What Radar's timeline shows

All times UTC, from `get_changes` and the Argo CD Application's status.

| Time | What happened |
|---|---|
| 21:27:00 | Argo CD Application `app` created (pasted in Radar Cloud). Sync status `Unknown` with a `ComparisonError`: the `deploy/` folder was not on `main` yet. |
| 21:29:38 | Pull request #1 merged. GitHub Actions builds the image. |
| 21:31:34 | Argo CD sees the deploy commit `bd1fb4d`. The `ComparisonError` clears by itself and an automated sync starts. |
| 21:31:35 | Sync succeeds: Deployment configured (image `node:22-alpine` to `ghcr.io/eduardovpessoa/samba-stack-overflow:7458f9a`, credentials from the Secret, new probes and security context), ConfigMap `app-code` pruned, Service unchanged. |
| 21:31:36 to 21:31:59 | Rolling update: new ReplicaSet `app-78f59b5cbb` scales 0, 1, 2 while the old one scales down. |
| 21:31:56 | Two `Warning Unhealthy` events: "Startup probe failed ... connection refused". |
| 21:31:59 | Application health `Progressing` to `Healthy`. 24 seconds from sync to healthy, no restarts. |

This answered a real question from the afternoon: the error shown in Radar
when the Application was pasted was that `ComparisonError`, caused by
applying the Application a few minutes before the merge. It needed no fix.

## 2. Live state

- `issues` for the namespace: **none**.
- Deployment `app`: 2 of 2 ready, pods `app-78f59b5cbb-hqzvl` and
  `app-78f59b5cbb-rqw52` on two different nodes, zero restarts.
- About 50 MB of memory per pod against a 384 Mi limit, and under 0.01 CPU
  cores for both pods together.
- Argo CD Application: `Synced`, `Healthy`, revision `bd1fb4d`.

## 3. The AI investigation

Verdict: **healthy**, certainty **established**, confidence 0.9.

> About 11 minutes before this check, ArgoCD rolled out a new revision of
> `app`: the image moved from a generic `node:22-alpine` to the app's actual
> build (`ghcr.io/eduardovpessoa/samba-stack-overflow:7458f9a`), and a batch
> of env vars/secrets (observability tokens, Elasticsearch, OTel attributes)
> and a new startup probe were added. During that transition one new pod
> briefly failed its startup probe with a connection-refused error —
> expected while a container is still booting — and Kubernetes logged a
> single warning event for it.
>
> That warning did not repeat. The deployment's event history after the
> rollout shows only normal `ScalingReplicaSet` entries completing the swap
> from the old replica set to the new one, and the Deployment's own
> conditions report `Available: True` / `Progressing: True` with "has
> successfully progressed."
>
> Checking the pods directly confirms this: both `app-78f59b5cbb-rqw52` and
> `app-78f59b5cbb-hqzvl` are `Running`, `1/1` ready, and tagged healthy,
> 10–11 minutes old (i.e., they've been stable since the rollout finished).
> Zero container restarts were recorded in the last hour, so there's no sign
> of a crash loop.
>
> One cosmetic note: application logs contain lines like "practice incident
> switch refused/changed" tied to a `samba.chaos.mode` flag — this looks
> like an intentional, app-level chaos/fault-injection toggle (fitting a
> hackathon "incident practice" theme), not a cluster-level problem, and it
> has no corresponding Kubernetes warning or restart.

The investigator read the app's own logs correctly: the "practice incident
switch refused" line is the ops-token check that Gitar's review added,
turning away an unauthenticated call.

### Follow-up question

Asked: is the startup-probe warning avoidable, and which of the three Checks
findings (section 4) carry real risk for a stateless two-replica web app
that never calls the Kubernetes API?

> **The startup-probe warning.** Yes, it's avoidable, and the fix is
> `initialDelaySeconds` [...] With no `initialDelaySeconds`, Kubernetes
> probes at ~2 seconds after the container starts, which on a healthy boot
> is often before your app has opened its listener on port 8080 [...] Don't
> shorten `failureThreshold` or `periodSeconds` to "fix" this.
>
> **Auto-mounted service account token — real risk, worth fixing.** [...]
> Since this app never talks to the Kubernetes API, that token is pure
> unnecessary attack surface — if the container is ever compromised, the
> attacker gets a live credential for free, for no functional benefit.
>
> **Missing PodDisruptionBudget — real risk for a 2-replica app, worth
> fixing.** [...] a voluntary disruption — a node drain, cluster upgrade, or
> descheduler action — can evict both pods at once [...]
>
> **Missing topology spread constraints — latent risk, lower priority.**
> Both current pods happen to sit on different nodes, but that's the
> scheduler's default best-effort spreading, not a guarantee [...] Minimal
> fix: [...] `whenUnsatisfiable: ScheduleAnyway` (soft, not
> `DoNotSchedule`).

One place we chose differently from the suggestion: it proposed a 2 to 3
second initial delay and said to tune it to the app's real time-to-listen.
The event had a count of two at a 2 second period, so the port opened
between 4 and 6 seconds after start. We set 5 seconds.

## 4. Radar Checks, before

Cluster-wide, Checks showed 14 open checks (1 high, 13 medium), 372 of 418
passing. Most belong to the pre-installed platform (Argo CD, Prometheus,
Radar itself) and are not this team's to change. Screenshots:
[before, part 1](../evidence/radar-checks-before-1.png) and
[before, part 2](../evidence/radar-checks-before-2.png).

For our namespace, `get_cluster_audit` returned three findings, all on
Deployment `app`:

| Check | Category | Finding |
|---|---|---|
| Service account token auto-mount | Security | The pod gets a Kubernetes API token it never uses |
| Missing PodDisruptionBudget | Reliability | 2 replicas, but a node drain may evict both at once |
| Missing topology spread constraints | Reliability | Nothing asks the scheduler to keep the replicas on different nodes |

## 5. What we did

All through git, in pull request #3, so Argo CD applies it:

- `automountServiceAccountToken: false` on the pod.
- A PodDisruptionBudget with `maxUnavailable: 1`.
- A topology spread constraint across nodes, with `ScheduleAnyway` so a
  rollout never blocks on it.
- `initialDelaySeconds: 5` on the startup probe, so a healthy start no
  longer logs a Warning.

## 6. After, read back through Radar

Pull request #3 merged at 21:47:44. Argo CD synced the deploy commit
`20270ec` at 21:48:46 and both pods of the new ReplicaSet `app-799d576957`
were healthy by 21:49:18, 32 seconds later.

| | Before | After |
|---|---|---|
| Checks findings in our namespace (`get_cluster_audit`) | 3 medium | **0** |
| Live issues (`issues`) | none | none |
| "Startup probe failed: connection refused" on rollout | 2 events | **none** |
| Pods | 2 healthy, two nodes | 2 healthy, two nodes |

One thing the after-check turned up that the before did not have: two
`Readiness probe failed: HTTP probe failed with statuscode: 503` Warning
events at 21:49:13.

## 7. Radar showed the symptom, Dash0 showed the cause

A 503 on `/readyz` means the pod was still warming up its search index. The
app's own trace of that warm-up, `samba.store.init`, is in Dash0:

| Pod | Release | Warm-up | First request to Elasticsearch (`GET /`) |
|---|---|---|---|
| `app-78f59b5cbb-rqw52` | `7458f9a` | 592 ms | 309 ms |
| `app-78f59b5cbb-hqzvl` | `7458f9a` | 392 ms | 123 ms |
| `app-799d576957-bvs2k` | `2c569c8` | 3065 ms | **2773 ms** |
| `app-799d576957-gwfjq` | `2c569c8` | 3072 ms | **2745 ms** |

Every later call in the warm-up took 13 to 83 ms on all four pods. So on
the second rollout the first outbound connection from each fresh pod cost
about 2.7 seconds, the warm-up took 3 seconds instead of half a second, and
it ran about a second past the first readiness probe. Radar's `issues` call
flagged a CoreDNS configuration update in the same minute, which may be
related; that link is not proven.

The pod was right to refuse traffic, so readiness is unchanged. Pull request
#4 moves the first startup probe from 5 to 8 seconds: boot (about 3 seconds)
plus the slowest warm-up measured.

## 8. The third rollout

Pull request #4 merged at 21:58:24 and rolled out between 21:59:12 and
21:59:45. Read back through Radar and Dash0:

| | Release 1 (`7458f9a`) | Release 2 (`2c569c8`) | Release 3 (`09a6cd2`) |
|---|---|---|---|
| First startup probe at | 0 s | 5 s | 8 s |
| Warning events during rollout | startup probe, connection refused (2) | readiness probe, 503 (2) | **none** |
| Warm-up (`samba.store.init`) | 592 ms, 392 ms | 3065 ms, 3072 ms | 420 ms, 594 ms |
| Checks findings in our namespace | 3 | 0 | 0 |
| Time from sync to both pods healthy | 24 s | 32 s | 33 s |

What this does and does not show: the third rollout was clean, and the two
earlier kinds of warning did not come back. But its warm-up was also fast
again, so this rollout did not exercise the slow case. That an 8 second
delay covers a 3 second warm-up rests on the measurements (about 3 seconds
to open the port plus 3.1 seconds), not on having seen it happen. The slow
first connection on release 2 looks like a one-off at that minute; Radar's
note about a CoreDNS update then is the only lead, and it is unproven.

## 9. The fourth rollout: the probe delay was not enough

Pull request #6 rolled out at 22:56. Radar's events for it show two Warnings:
`Readiness probe failed: HTTP probe failed with statuscode: 503` at 22:57:04
and `Readiness probe failed: ... connection refused` at 22:57:10. The second
one was not traced to a pod; it may be an old pod shutting down.

Dash0's trace of the warm-up on the two new pods:

| Pod | Warm-up | First request to Elasticsearch |
|---|---|---|
| `app-56ffff7897-hxxfg` | 437 ms | 140 ms |
| `app-56ffff7897-pvd48` | **7402 ms** | **5016 ms, then retried: 220 ms** |

So the 8 second delay from pull request #4 was not enough: a pod that needs
about 3 seconds to open its port and 7.4 seconds to warm up is ready after
about 10 seconds. Across today's four releases, three of eight fresh pods had
a slow first connection (2.7 s, 2.7 s and 5.0 s).

What we take from it:

- The warning is the readiness probe doing its job: the pod was not ready
  and received no traffic. Nothing a visitor could see went wrong.
- Raising the delay again would make every rollout slower to hide something
  that happens on some pods. That treats the symptom.
- The cause is the first outbound connection from a new pod. A request that
  hangs for almost exactly 5 seconds and then succeeds on retry is what a
  lost DNS lookup looks like, and Radar keeps flagging the cluster's CoreDNS
  configuration, but this is a lead, not a finding.
- **Not fixed.** The next thing to try is fewer DNS lookups for external
  names (a lower `ndots` in the pod's DNS options) and comparing warm-up
  times across a few rollouts.

