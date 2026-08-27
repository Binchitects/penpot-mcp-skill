# penpot-kit eval suite

Regression tests for the `penpot-api` skill. Each case targets one documented failure
mode — the kind that produces confident, plausible, wrong output when the skill is absent.

## Cases

| Case | Guards against |
|---|---|
| `applytoken-toggle` | Re-applying a token silently UNBINDS it |
| `addtheme-signature` | `addTheme(group, name)` positional form (docs are wrong) + both alias sets active |
| `token-path-collision` | A token name that is both a leaf and a prefix |
| `font-exact-match` | `findByName("Roboto")` returning Roboto Mono |
| `query-projection` | Dumping raw objects instead of projecting |
| `variant-stray-axis` | Leaving the auto-generated `Property N` axis behind |

## Design notes

**No live Penpot connection required.** Every prompt asks the model to WRITE CODE or give
advice, never to execute against a connected file. The suite therefore runs in CI.

**Graders are rubrics, not string matches.** Each states what MUST appear, what fails, and
what earns credit without being required — so a correct answer phrased differently still
passes, while a fluent wrong answer still fails.

**Ablation is the real signal.** Run with `--ablation with-without` to measure the delta
between the plugin being present and absent. A case that passes in BOTH arms is testing
general competence, not this skill, and should be tightened or dropped.

## Running

```
claude plugin eval penpot-kit@penpot-kit --ablation with-without
claude plugin eval penpot-kit@penpot-kit --case applytoken-toggle --verbose
claude plugin eval penpot-kit@penpot-kit --json --threshold 0.8   # CI
```

## Status

**These cases have not been executed.** `claude plugin eval` is currently in early access
and was not enabled on the authoring account, so the suite is written to the documented
`evals/**/prompt.md + graders/*.md` layout but its schema and scores are unverified.

First run should be treated as a shakedown: expect to adjust grader strictness, and
confirm the runner discovers `graders/` inside each case directory rather than at the
`evals/` root. If discovery differs, move the grader files accordingly — the rubric
content is what matters and transfers either way.
