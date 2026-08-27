# Grader: addTheme signature and the activation trap

Two independent things are being tested.

## Pass requires BOTH

1. **Correct signature.** `addTheme` must be called with a SINGLE OBJECT:
   `cat.addTheme({ group: "...", name: "..." })`.
   The positional form `addTheme("group", "name")` is WRONG and throws
   `[PENPOT PLUGIN] Value not valid` — the bundled Penpot MCP docs document it incorrectly.

2. **Recognises the collision.** The response must note that having both Alias/Light and
   Alias/Dark active simultaneously is a problem: they define the same token names, resolve
   by set precedence, and the losing set silently reports the winner's `resolvedValue`.
   The fix is mutually exclusive themes in the SAME group, plus explicitly deactivating the
   unwanted alias set.

## Fail if

- It uses the positional `addTheme(group, name)` form.
- It creates the themes but never addresses that both alias sets are active.

## Credit (not required)

Noting that directly toggling a TokenSet disables all themes, so stray sets should be
deactivated BEFORE activating the desired theme, is a sign of real understanding.
