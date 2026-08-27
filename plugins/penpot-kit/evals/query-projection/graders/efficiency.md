# Grader: project, do not dump

This tests token discipline, not API knowledge.

The naive approach — returning `penpotUtils.getPages()` and reading the result — costs
~4,600 characters on a 71-page file to answer a question whose real answer is ~46
characters. Measured, not estimated.

## Pass requires

The code passed to `execute_code` must RETURN A PROJECTION: page names (and optionally a
child count) for non-empty pages ONLY. The filtering must happen INSIDE the executed code.

Acceptable shapes include `["Cover:2", "Layout:1"]` or `[{name, count}]`, or a call to a
helper such as `storage.pk.pages()`.

## Fail if

- It returns `penpotUtils.getPages()` directly, or returns full page objects.
- It returns every page including empty ones, leaving the filtering to be done by reading
  the output.
- It logs the page list via `console` AND returns it (double-charged).

## Credit

Explicitly noting that raw objects serialise enormously and that filtering belongs inside
`execute_code` rather than in the transcript.
