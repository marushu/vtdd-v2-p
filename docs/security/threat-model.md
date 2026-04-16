# Threat Model

## Goal

VTDD V2 should assume partial compromise is possible and reduce blast radius when it happens.

## Protected Assets

- repository integrity
- approval boundary integrity
- credential safety
- runtime truth integrity
- memory integrity

## Main Risk Areas

### Credential Leakage

- leaked secrets,
- leaked private keys,
- leaked tokens.

Mitigation:

- short-lived credentials,
- role separation,
- no permanent destructive credentials,
- secret exclusion from memory.

### Control Plane Compromise

- orchestration bug,
- approval bypass,
- incorrect target resolution.

Mitigation:

- thin control plane,
- explicit repo resolution,
- destructive action path separation,
- audit logs.

### Prompt or Resolution Failure

- misunderstood internal names,
- external assumptions overriding local context,
- conversation mistaken for spec.

Mitigation:

- alias registry,
- context-first resolution,
- Issue-as-spec,
- execution confirmation.

### Over-privileged Automation

- one credential doing everything,
- reviewer holding execution power,
- destructive permission always available.

Mitigation:

- permission segmentation,
- reviewer isolation,
- destructive actions on a separate path.

### Runtime Truth Failure

- stale state,
- provider outage,
- memory/runtime conflict.

Mitigation:

- runtime truth precedence,
- reconcile when conflict exists,
- safe hold when truth is unavailable.

## Design Principle

VTDD V2 should optimize for graceful failure and contained damage, not impossible perfect defense.
