# Security Policy

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting on this repository
(Security tab → Report a vulnerability).

Include what you can: what you found, how to reproduce it, and what an attacker gets out of it.

This is a small project maintained by one person in their spare time. There is no guaranteed response
time, and no bug bounty. What there is: reports get read, and anything real gets fixed or documented.

## What is in scope

Chronorium has no server, no accounts, no central service and no third party data. Its attack surface
is narrow and concrete. In scope:

| Area                                                  | Why it matters                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| **Prompt injection through source content**           | anyone can publish an article whose title contains instructions            |
| **Fabricated or poisoned links in the output**        | the reader clicks something the system never saw                           |
| **Injected markup reaching the email or the archive** | code execution in a mail client or viewer                                  |
| **Credential leakage**                                | into a commit, a log, or the report itself                                 |
| **Quota exhaustion** through an oversized source      | cost, or hitting a provider limit                                          |
| **Supply chain of the reusable workflow**             | whoever controls this repository runs code in every instance that calls it |

The last one deserves a note, because it comes from the two repository design: instances call a
reusable workflow from this repository. **This is why instances are told to pin a tag, never a
branch.** If you run an instance, check that yours does.

## What is out of scope

- Anything requiring write access to a user's own private instance repository. That is their
  perimeter, not this one.
- The quality or accuracy of the generated reports. A model writing something wrong is a product
  issue, not a vulnerability.
- Denial of service against a user's own scheduled run.
- Third party services (model providers, mail providers, source sites). Report those to them.

## How this project defends itself

The governing principle: **what you ask the model for is a preference, what the code enforces is a
guarantee.** Defences that matter live in code, not in the prompt.

- Source content is delimited and marked as untrusted in the prompt.
- Model output is constrained to the declared structure. No free text.
- **Every link in the output is checked against the input set. Anything not there is dropped**, and
  counted.
- All external and generated content is escaped before entering any marked up output.
- Secrets are read only from the environment, never logged, not even masked.
- Item caps are applied per source and globally before the model is called.

There is a repeatable attack battery of ten cases, documented in `docs/05-seguridad-legal.md`. It runs
without network access and gates every release. If you find a case it misses, that is a valuable
report on its own.

## For people running an instance

- Keep your instance repository **private**. It holds your profile and your report archive.
- Put secrets in your repository's secret store, never in a file.
- **Pin a tag, not a branch**, when calling the reusable workflow.
- Configure a second model provider. One working credential is a single point of failure, and the
  tool will warn you about it at startup.
