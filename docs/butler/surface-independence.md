# Butler Surface Independence

## Principle

Butler must not be defined by any single AI product or UI surface.

## Initial Baseline

VTDD V2 may initially use ChatGPT Custom GPT as the Butler surface.

This is an implementation convenience, not a core identity.

## Separation Model

Butler should be understood as four separable layers:

- role
- contract
- runtime
- surface

### Role

Conversation, specification support, execution judgment, context recovery.

### Contract

Inputs, outputs, judgment order, approval expectations, and resolution rules.

### Runtime

Memory retrieval, runtime truth retrieval, proposal handling, approval orchestration.

### Surface

- ChatGPT Custom GPT
- web UI
- mobile app
- CLI
- future provider-specific surfaces

## Requirement

Replacing the surface must not redefine Butler's judgment model or memory model.

## Goal

VTDD V2 should support a future where each user has a dedicated Butler while the shared VTDD core remains common.
