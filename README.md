# Chronorium

**Who this is for:** anyone with a GitHub account who wants a periodic report on a topic they
follow. Nothing below requires writing code.

Chronorium turns whatever you want to keep up with into a periodic report with an opinion, and
what you can do about it. The engine knows nothing about news or AI: your topic, sources, tone,
and report structure all live in a _recipe_ (a folder of YAML and Markdown you edit), never in
code. Point it at biotech, at legal filings, at your own stack, and it behaves the same way.

## A real report, end to end

This is the actual output of `recipes/example`, generated for real (real model, live sources), not
hand-edited.

![A daily report rendered as an email, with a summary, top stories, and an opinion on each](docs/assets/informe-ejemplo.png)

The full text (in case the image doesn't load) is at [docs/informe-ejemplo.md](docs/informe-ejemplo.md).

## Get your own instance

This is what most people actually want: your own topic, on your own schedule, delivered wherever
you check things. Two steps, no code:

1. **Write your recipe** — three text files that decide what your report is about: topics,
   sources, tone. See [Write your own recipe](docs/07-escribir-una-receta.md); it includes a
   prompt you can hand to an AI assistant if you'd rather not write it by hand.
2. **Create your instance** — a small repository with your recipe and a `briefing.yml` that tells
   GitHub Actions when to run it. See [Set up your own instance](docs/arranque.md).

You don't need to fork this repository for either step. Your instance repository stays small (your
recipe, plus the archive it fills in on its own): it calls this engine directly, pinned to a
released version, the same way any GitHub Action calls a reusable workflow.

## Try it first, in five minutes

Want to see it work before writing your own recipe? Fork this repository and run the bundled
example locally. One thing to sign up for: a free API key from Google AI Studio for the model that
writes your report. Nothing else needs an account, and no source in the example recipe requires a
credential of its own.

1. **Fork this repository**, then clone your fork:

   ```bash
   git clone https://github.com/<your-username>/chronorium.git
   cd chronorium
   ```

2. **Install dependencies.** This project uses [pnpm](https://pnpm.io)(Run `npm install -g pnpm` to install it if you don't have it);
   running plain `npm install` here skips the lockfile this project relies on.

   ```bash
   pnpm install
   ```

   You'll see pnpm resolve and link the packages listed in `package.json`. No output beyond that
   means it worked.

3. **Set your model key.** Get a free key from [Google AI Studio](https://aistudio.google.com/apikey), then export it in your shell:

   ```bash
   export GOOGLE_GENERATIVE_AI_API_KEY="your-key-here"
   ```

4. **Run the example recipe:**

   ```bash
   pnpm cli run --recipe example
   ```

   This fetches from <!-- check-docs:example-source-count -->`4`<!-- /check-docs:example-source-count -->
   live public sources, ranks and deduplicates what they return, sends it
   to the model, and writes the report to `data/archive/`. You'll see a one-line summary of what
   was collected and where the report landed. If a source is down or rate-limited, the run still
   succeeds and says so, it doesn't fail the whole report over one flaky feed.

That's it: no server, nothing to deploy, no account beyond the model provider's.

## Before you trust it

Chronorium exists because an earlier version of this same idea quietly broke in five specific,
measured ways over 49 days of unattended runs. Nothing here is hypothetical:

- **A backup chain with one live link looks redundant but isn't.** A single working credential
  behind two configured providers cost six days of missing reports before anyone noticed. Chronorium
  checks this at startup and says so out loud if you only have one provider configured.
- **A per-event alert doesn't tell you about a chronic problem.** Five alerts were sent while eleven
  days of reports were silently lost, because each alert only said "today failed," never "you're on
  day nine." Chronorium's health status travels inside the report itself, not just as a one-off
  notification.
- **A placeholder saved as a credential doesn't fail when you save it, it fails every morning.**
  Chronorium's validation rejects the documented placeholder value outright, before a single run
  depends on it.
- **A rule written into the model's prompt is a preference, not a guarantee.** Anything that has to
  hold, like "never invent a link that wasn't in the input," is enforced in code that checks the
  model's output, not requested from the model and hoped for.
- **Documentation drifts from code within weeks if nothing checks it.** `pnpm run check:docs` runs in
  CI and fails the build if a documented default, environment variable, or source count stops
  matching reality.

## Learn more

- **[Write your own recipe](docs/07-escribir-una-receta.md)** — the guide almost everyone needs. No
  code, just editing text files. Includes a copy-paste prompt if you'd rather have your own AI
  assistant walk you through it.
- **[Set up your own instance](docs/arranque.md)** — turn your recipe into something that runs
  every morning on its own: schedule, secrets, checklist. Also has a copy-paste prompt.
- **[Extend the engine](docs/08-extender-el-motor.md)** — adding a new source type or delivery
  channel, for people comfortable writing TypeScript.
- **[Glossary](docs/glosario.md)** — every term used above, one sentence each.
- **[Full documentation](docs/README.md)** — architecture, data model, and the design decisions
  behind why this project looks the way it does.
- **[License](LICENSE)** (MIT) · **[Contributing](CONTRIBUTING.md)** · **[Security policy](SECURITY.md)**

Prefer Spanish? See [README.es.md](README.es.md).
