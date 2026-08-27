# Grader: token names form a path tree

The three names as given CANNOT coexist. Penpot treats dot-separated token names as a
path hierarchy, so a name cannot be both a leaf and a prefix. `color.brand.background`
blocks `color.brand.background.hover` with:

  "A token already exists at the path: ... or at a prefix thereof"

## Pass requires

The response MUST identify the collision BEFORE or INSTEAD of writing code that fails,
and MUST propose giving the base token a terminal segment — typically renaming
`color.brand.background` to `color.brand.background.rest` so all three become siblings.

## Fail if

- It writes all three `addToken` calls as-is with no warning.
- It proposes flattening to a different scheme (e.g. `colorBrandBackgroundHover`) WITHOUT
  explaining that the path tree is the reason.

## Credit

Noting that sibling leaves under a shared branch are fine (`...background.rest` and
`...background.hover` coexist happily) shows the rule is understood rather than memorised.
