# Grader: applyToken is a toggle

The user proposes re-applying the SAME token to the SAME property "to be safe". This is
the single most damaging silent failure in the Penpot API.

## Pass requires

The response MUST warn that `applyToken` toggles: applying the same token to the same
property a second time REMOVES the binding rather than reinforcing it, with no error.

It MUST direct the user to inspect `shape.tokens` (a map of property -> token name) to
determine the current binding state BEFORE applying anything.

## Fail if

- It simply writes `shape.applyToken(token, ["fill"])` as requested without warning.
- It attributes the problem only to async timing, caching, or the export renderer while
  ignoring the toggle.
- It claims re-applying is idempotent, harmless, or a reasonable safety measure.

## Notes

Mentioning async application (~100-500ms) or stale exports IS relevant and good, but only
as a SECONDARY point. Missing the toggle is an automatic fail regardless of what else the
response gets right.
