# 2026-09-24 — Butler first live end-to-end

## Milestone

2026-09-24, VTDD / Butler architecture completed its first live owner-facing end-to-end operation from the normal ChatGPT conversation.

Route:

```
Owner (iPhone / iPad ChatGPT)
  -> ChatGPT Butler
  -> Remote Desktop Commander
  -> Shuheis-MacBook-Pro
  -> Terminal / SSH
  -> target server
  -> result back to the same ChatGPT conversation
```

The owner did not manually relay prompts, commands, or results between ChatGPT and the Mac.

## Verified live capabilities

- ChatGPT detected the connected Mac through Remote Desktop Commander.
- ChatGPT read `~/.ssh/config` on the Mac.
- ChatGPT resolved SSH aliases including `sakura_hibou`.
- ChatGPT connected to `sakura_hibou` and inspected the web root.
- `nukumihoikuen.com` was confirmed at `/home/hibou/www/nukumihoikuen.com`.
- WordPress / PHP / OS / web server information was inspected remotely.
- A public-root SQL backup was identified and, after an explicit owner request, exactly that one file was deleted with pre-check and post-delete verification.

## Architecture after this milestone

### Butler / orchestration
ChatGPT is the main owner-facing Butler surface, primarily from iPhone and iPad.

### Execution
Mac Codex is the primary heavy execution agent for development work.
Remote Desktop Commander is the direct ChatGPT-to-Mac hand/transport, exposing the Mac filesystem, Terminal, local repos, Xcode, and SSH. Simple inspection and operational tasks may be executed directly through RDC without involving Mac Codex.

### Memory
Memory is shared across:
- ChatGPT conversation / product memory
- Cloudflare VTDD operational memory
- repo/runtime truth where appropriate

Cloudflare remains the durable operational-memory / task-progress / Mission candidate. GitHub remains the code, Issue, PR, CI, and durable artifact truth; it is not the preferred conversational task bus.

## Operational meaning

This date marks the transition from a Butler concept requiring owner relay work to a working Butler path where the owner can state intent in ChatGPT and the system can reach the Mac and servers directly.

Related operational-memory record:
`mem_efde3bdc-4d79-4261-9e26-640df952770b`

Related root work:
Issue #845
