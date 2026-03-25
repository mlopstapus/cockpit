# Data Model: 006-init-speckit-constitution

This feature adds no new persistent entities. It modifies the init flow that produces the existing `RepoEntry` config entity, and introduces a transient `ConstitutionDraft` used only during the wizard session.

---

## Existing Entity: RepoEntry (unchanged shape)

Stored in `~/.cockpit/config.json` under `repos[]`.

| Field | Type | Validation | Notes |
|-------|------|-----------|-------|
| `repo` | string | `/^[\w.-]+\/[\w.-]+$/` | `owner/name` format |
| `localPath` | string | non-empty | absolute path to local clone |
| `startupCommand` | string | optional | shell command run after implement |

**New init flow populates the same shape.** Whether the user clones or provides a local path, the resulting `RepoEntry` is identical.

---

## Transient: RepoSetupInput (wizard session only, not persisted)

Represents the user's answers during the repo-adding step.

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `alreadyCloned` | boolean | true / false | Answer to "Have you already cloned this repo?" |
| `repoIdentifier` | string | `owner/repo` or HTTPS URL | Only used when `alreadyCloned === false` |
| `localPath` | string | absolute path | Provided directly (alreadyCloned=true) or derived after clone |
| `cloneDestination` | string | absolute path | Confirmed or edited by user; only when cloning |

---

## Transient: ConstitutionDraft (wizard session only)

Represents the user's answers to the four-section constitution wizard. Written to disk as `constitution.md` at the end of the wizard.

| Field | Prompt | Default |
|-------|--------|---------|
| `corePrinciples` | "What are the core principles for work in this repo?" | "All changes must be transparent, auditable, and scoped to feature branches." |
| `securityRequirements` | "What are the security requirements for this project?" | "Secrets must never appear in source code or logs. All inputs from external sources must be validated." |
| `developmentWorkflow` | "Describe the development workflow (branching, review, testing):" | "Feature branches follow ###-feature-name convention. All features delivered as PRs. Tests required before merging." |
| `governance` | "How are project decisions and amendments governed?" | "Changes to project principles require written rationale and project owner approval." |

**Output path:** `<localPath>/.specify/memory/constitution.md`

**Output format:** Markdown document with one `##` section per field, populated with the user's answer.

---

## State Transitions: Repo Setup in Init Wizard

```
start
  └─► ask "already cloned?"
        ├─► YES → ask local path → validate path exists → RepoEntry registered
        └─► NO  → ask repo identifier → parse to owner/repo
                  └─► ask clone destination (default: ~/repos/<name>)
                        └─► check dest not occupied → git clone → RepoEntry registered
                              └─► (both paths merge here)
                                    └─► offer spec-kit install
                                          ├─► SKIP → RepoEntry saved, done
                                          └─► ACCEPT → check specify on PATH
                                                └─► specify init <path> --ai claude
                                                      ├─► non-zero exit → show error, continue
                                                      └─► success → offer constitution wizard
                                                            ├─► SKIP → done
                                                            └─► ACCEPT → 4 prompts → write constitution.md → done
```
