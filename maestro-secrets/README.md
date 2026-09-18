# maestro-secrets

**Hooks:** `PreToolUse`, `PreLLMCall` · **Action:** stop credentials from leaking.

Distinct from the guardrail (destructive ops) — this one is about **leaks**.

- **PreToolUse:** blocks a tool command that carries a secret-shaped value, so a
  token/key never gets echoed into the session transcript.
- **PreLLMCall:** blocks a model call whose outgoing payload carries a
  secret-shaped value, so it never reaches the model provider.

Ships generic, narrow detectors: AWS access/secret keys, GitHub/GitLab tokens,
Slack/Stripe/OpenAI/Google prefixes, `Bearer` tokens, JWTs, PEM private-key
blocks, and `KEY=value` where `KEY` names a secret. An opt-in high-entropy sweep
(`secrets.highEntropy`) catches base64 blobs. Extend via `secrets.extraDetectors`
and exempt deliberately-public values via `secrets.allowlist`. It **never prints
the matched secret** — reasons name only the *kind*. Fail-open.

> **Muse 1.3 limitation:** the hook API does not allow mutating LLM-bound
> messages (`updatedMessages` is rejected), so true in-place redaction of model
> content is not possible. maestro-secrets therefore fails **closed** (blocks)
> rather than silently redacting — safer, since a missed redaction is a leak. The
> shipped `redact()` helper (`[REDACTED:kind]`) is used for safe logging/reasons.
