#!/bin/sh
# Emit a single-line pointer ONLY when a Penpot manifest exists in the project.
#
# This hook fires on every session, including sessions with no Penpot work, so it must
# stay silent by default. Dumping the manifest here would recreate the very token cost
# this plugin exists to remove.

if [ -f ".penpot/manifest.json" ]; then
  printf 'Penpot design-system manifest available at .penpot/manifest.json — read it before Penpot work instead of re-querying the design.\n'
fi

exit 0
