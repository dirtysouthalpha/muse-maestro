# maestro-brain

**Hook:** `SessionEnd` · **Action:** persist a durable fact to a memory API.

At session end it conservatively distills one clearly-durable fact (topology, a
fix with evidence, a config-that-lies scar) and `POST`s
`{content, region, source, topic}` to an HTTP endpoint you choose. Ships
**disabled**; set `brain.endpoint` (and optionally `brain.searchEndpoint` for
dedupe) to enable. Transient chatter is skipped. Fail-open — an unreachable
endpoint never affects the session.
