# Contributing

Thanks for looking. A word about expectations before anything else, because it saves everyone time.

## What this project is, and is not

Chronorium is built to be **finished, not alive**. It is a small tool that does one thing, and the
goal is that it keeps doing it without needing constant attention.

That means:

- **Issues and pull requests are welcome**, and there is no promised response time. This is not a
  maintained product with an on-call rotation.
- **Fork it.** If you want it to do something different, forking is the intended path, not the fallback.
  The whole design exists so you can point it at your own domain without changing the code.
- **Feature requests get a slow "no" more often than a yes.** That is deliberate. See
  `docs/06-extensibilidad.md`, which lists what was left out and what would have to happen for it to
  come in.

## Before you open an issue

Check `docs/06-extensibilidad.md` and `docs/04-decisiones-adr.md`. Most of the obvious ideas are
already there, either as a future with a stated trigger or as a boundary with a stated reason. If your
idea is in there, the useful conversation is about whether the trigger has been met, not about the
idea itself.

## The one rule that governs everything

**If a decision belongs to the domain, it goes in the recipe. If it belongs to the mechanism, it goes
in the code.**

When in doubt: would someone tracking biotechnology news need to change this? If yes, it cannot live
in `src/`.

The previous version of this project died from breaking that rule. The recipient of the report was
written into the prompt nine times, and the report schema was hand written in four places.

## Practical rules

- **Renderers never know section names.** If you write `if (section === '...')` anywhere, the premise
  is broken.
- **Source readers are chosen by declared type, never by inspecting a URL.** That exact inspection was
  the root cause of a bug that ran for 41 consecutive days.
- **What you ask the model for is a preference. What the code enforces is a guarantee.** Anything that
  matters goes in code. Links returned by the model are checked against the input set and dropped if
  absent, and that is the pattern to follow.
- **A failure never exits with code zero.**
- **Pure logic is tested without network and without credentials.** Scoring, deduplication, schema
  building, link validation, date parsing and escaping all qualify.
- **No new dependency without checking whether the runtime already provides it.**

## Adding things

The three extension points are documented with their contracts in `docs/02-arquitectura.md`:

| You want to add    | Read                                                      |
| ------------------ | --------------------------------------------------------- |
| a source type      | the `SourceReader` contract                               |
| a delivery channel | the `Notifier` contract. `telegram` is the worked example |
| an output format   | the `Renderer` contract                                   |

A new source type that requires credentials must make recipe validation **fail loudly** when they are
missing, never fail quietly at run time.

## Pull requests

- One change per pull request. If the description needs an "and also", it is two.
- CI has to be green, including the project specific checks: no personal data in `src/`, the example
  recipe still produces a report, and the docs do not contradict the code.
- If you change behaviour, update the docs in the same pull request. Documentation drift is checked
  by CI for exactly this reason.
- If you change an architectural decision, **add a new ADR**. `docs/04-decisiones-adr.md` is never
  rewritten.

## Security

Do not open a public issue for a security problem. See `SECURITY.md`.
