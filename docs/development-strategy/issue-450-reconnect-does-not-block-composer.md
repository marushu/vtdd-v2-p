# Issue #450 reconnect does not block composer

## Root

PR #713 removed the misleading HTTP fallback path, but kept the composer lock
from the old send flow when WebSocket was disconnected. That made the owner
press send, enter pending state, and then lose the ability to keep operating
while reconnect waited.

## Strategy

- Do not restore HTTP fallback as a normal conversation path.
- If WebSocket is disconnected at submit time, keep the text in the composer,
  keep the composer editable, and store one pending owner message for reconnect.
- When the WebSocket opens, send the pending owner message with the latest
  composer text and the existing `clientMessageId` dedupe boundary.
- If attachments are selected while disconnected, do not upload or queue them
  silently. Keep the composer editable and ask for a resend after reconnect.

## Verification

- Dashboard shell contract test must prove the old locked-message copy is gone.
- Dashboard shell contract test must prove the reconnect pending state does not
  depend on HTTP fallback.
- Production E2E after merge/deploy must confirm iPhone Dashboard Butler can
  send again.
