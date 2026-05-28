# Issue #573 Dashboard mobile horizontal scroll local E2E

Date: 2026-05-28

## Scope

- Issue #573: dashboard mobile horizontal scroll / side-to-side jitter.
- Issue #605: composer-focus mobile drawer affordance must not introduce horizontal scroll.

## Scenario

Rendered the Dashboard Butler chat shell at a 390 x 844 mobile viewport, focused the composer, and injected long URL/code/list content into the chat log to exercise known overflow sources.

## Result

### Chrome Mobile Viewport

- `viewportWidth=390`
- `documentScrollWidth=390`
- `bodyScrollWidth=390`
- `scrollX=0`
- `maxRightOverflow=0`
- `.topbar`: `left=10`, `right=380`, `overflowX=hidden`, `touchAction=pan-y`, `overscrollBehaviorX=none`
- `.chat-scroll`: `left=10`, `right=380`, `scrollWidth=370`, `clientWidth=370`, `paddingRight=18px`, `overflowX=hidden`, `touchAction=pan-y`, `overscrollBehaviorX=none`, `scrollbarGutter=stable`
- `.composer`: `left=10`, `right=380`, `scrollWidth=370`, `clientWidth=370`, `overflowX=hidden`, `overscrollBehaviorX=none`
- `.composer-box`: `left=10`, `right=380`, `scrollWidth=368`, `clientWidth=368`, `overflowX=hidden`, `overscrollBehaviorX=none`
- owner bubble stayed inside the viewport with scrollbar clearance: `right=362`
- long code block stayed inside the viewport with scrollbar clearance: `right=362`

### iOS Simulator Safari

- Device: iPhone 17 Pro simulator, iOS 26.5
- Runtime: local worker-backed Dashboard page served at `http://127.0.0.1:8802/dashboard?repository=marushu%2Fvtdd-v2-p&issueNumber=573`
- Result: Safari rendered the Dashboard chat screen without the prior whole-page horizontal scrollbar. Owner bubbles were not clipped after removing the over-broad owner-bubble `overflow: hidden`. The chat log has right-side scroll-indicator clearance so the vertical scrollbar does not sit on top of the text edge.

## Evidence

- Screenshot: `docs/mvp/e2e/assets/issue-573/dashboard-mobile-horizontal-scroll-local.png`
- iOS Simulator Safari screenshot: `docs/mvp/e2e/assets/issue-573/ios-simulator-dashboard-horizontal-scroll.png`

## Notes

iOS Safari's keyboard input accessory bar is browser UI and cannot be removed by Dashboard CSS. This slice prevents the Dashboard shell, chat scroll container, composer, long links, and code blocks from creating horizontal overflow underneath that browser UI.
