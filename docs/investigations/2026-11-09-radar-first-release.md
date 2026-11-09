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
