# Grader: clean up the auto-generated variant axis

`penpotUtils.createVariantContainer` (and the underlying
`penpot.createVariantFromComponents`) ALWAYS creates one property named `Property 1`.
After assigning your own axes you are left with a spurious extra axis carrying
`Value 1` on every component. It does not error and it is easy to miss.

## Pass requires

The response MUST remove the stray auto-generated property, via
`container.variants.removeProperty(pos)`, locating it by index or by matching
`/^Property \d+$/`.

Note that `removeProperty` is NOT documented in the bundled MCP overview — a response
that claims removal is impossible is wrong.

## Fail if

- It builds the variant group and stops, leaving the stray axis in place.
- It claims the extra property cannot be removed.

## Credit

Verifying afterwards that `variants.variantComponents().map(c => c.variantError)` is
empty, and that `variants.properties` contains exactly the intended axes.
