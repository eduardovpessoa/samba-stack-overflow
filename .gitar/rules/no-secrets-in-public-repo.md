---
title: "No secrets in a public repo"
description: "Block credentials from reaching a public repository and a public container image."
type: check
when: "A pull request adds or changes any file"
actions: "Fail the check and comment inline when a credential, token, or kubeconfig appears in the diff"
---

# No secrets in a public repo

This repository and its image on GHCR are public.

Fail this check when the diff contains any of:

- an Elasticsearch API key, a Dash0 auth token, an OpenAI key, a GitHub
  token, or any other string that looks like a live credential, including in
  comments, tests, fixtures, YAML and Markdown;
- a kubeconfig, a private key, or a `.env` file other than `.env.example`;
- a Kubernetes `Secret` manifest with real values under `data` or
  `stringData`;
- a credential passed as a Docker build argument or written into the
  Dockerfile.

Comment inline on the exact line, say which secret it appears to be, and say
that it must be revoked with the provider because it is already in git
history. Do not repeat the secret's value in the comment.

`.env.example` with empty values, `secretKeyRef` references by name, and the
placeholder text in the README are fine.
