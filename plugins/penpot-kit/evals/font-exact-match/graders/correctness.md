# Grader: font lookup is fuzzy

`penpot.fonts.findByName` does fuzzy matching and silently returns the WRONG family:

- `findByName("Roboto")`    -> **Roboto Mono**
- `findByName("Inter")`     -> **Inter Tight**
- `findByName("Noto Sans")` -> **Noto Sans Ogham**

This is verified live behaviour, not a hypothetical.

## Pass requires

The response MUST NOT rely on `findByName` alone to resolve "Roboto". It must either:

- match exactly against `penpot.fonts.all`, e.g.
  `(penpot.fonts.all || []).filter(f => f.name.toLowerCase() === "roboto")[0]`, or
- explicitly warn that `findByName` is fuzzy and that the result must be verified before use.

## Fail if

- It writes `penpot.fonts.findByName("Roboto")` and uses the result with no verification
  or caveat.

## Credit

Checking that weight 500 actually exists in the family's `variants` before setting it.
