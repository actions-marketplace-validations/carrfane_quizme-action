# High-level quiz — Design

Date: 2026-10-09
Status: Draft
Amends: `2026-07-28-quizme-action-design.md`

## Problem

Today's quizzes check code-level detail: which Node version a job asks for,
which steps moved to v5. They read like code review. When the code was written
by an agent, that is the wrong level. What the author has to know is what the
change does to the system, whether it does what they asked for, and what else it
affects.

## Goal

Questions test system-level understanding:

1. **Intent.** Does the code do what the PR description says it should?
2. **Behavior.** What does the system do differently once this merges?
3. **Side effects.** What else is affected: callers, jobs, data, configuration,
   other services?
4. **Rationale.** What problem does this solve, and what would the obvious
   alternative have cost?

## Decisions

| Topic | Decision |
| --- | --- |
| Source of intent | PR title and body. The author pastes the ClickUp task summary into the body. No ClickUp or issue API calls |
| Context beyond the diff | None for now. Prompt and PR text only; judge by real use before adding any |
| Answer format | Four-option multiple choice, graded offline. Unchanged |
| Question mix | Fixed slots, worked out in code and cycled |
| Identifiers | Plain-language questions and options. The explanation cites the proving file or symbol |
| Empty description | Intent slot is replaced by rationale |
| Labels | Every question shows its angle |
| Evaluation | Use on real repos via a pre-release tag, judged by eye |

## Out of scope

- ClickUp, Jira or linked-issue fetching.
- Gathering code outside the diff (callers, `git grep`).
- Open-ended or LLM-graded answers.
- A reflection checkbox ("this surprised me").
- An offline prompt comparison script.
- Re-quizzing when the PR body is edited. `pull_request.edited` is still not
  handled; comment `/quizme` to regenerate.

## Design

### 1. PR description as input

`prContext` in `router.mjs` adds `body: pr.body ?? ''`. Both paths already hold a
full PR object (`payload.pull_request`, or `getPullRequest` for `/quizme`), so
this needs no new API call.

A new pure function, `cleanDescription(body)`:

1. Strips HTML comments (`<!-- ... -->`), which PR templates leave behind.
2. Trims, and collapses runs of three or more newlines to two.
3. Caps at `MAX_DESCRIPTION_CHARS = 4000`. A cut body ends with
   `[... description truncated ...]`.

It returns `{ text, hasIntent }`. `hasIntent` is `text.length >= 40`, measured
before truncation. An unfilled template whose headings survive will count as
intent. That is accepted; parsing templates is not worth it.

### 2. Slot plan

New module `scripts/lib/slots.mjs`:

```js
export const ANGLES = {
  intent: 'Intent',
  behavior: 'Behavior',
  side_effects: 'Side effects',
  rationale: 'Rationale',
};

export function planSlots(count, hasIntent) // -> string[] of angle keys
```

- With intent the cycle is `intent, behavior, side_effects, rationale`.
- Without intent it is `rationale, behavior, side_effects`. Intent cannot be
  asked about with nothing to check against.
- The cycle repeats until `count`. For example, `planSlots(3, true)` gives
  `[intent, behavior, side_effects]` and `planSlots(5, false)` gives
  `[rationale, behavior, side_effects, rationale, behavior]`.

### 3. Prompt (`prompts/generate.md`)

Rewritten. New placeholders: `{{PR_TITLE}}`, `{{PR_DESCRIPTION}}` and
`{{SLOTS}}`. The existing ones stay.

- **Framing.** The author probably had an agent write this. Test whether they
  know what it does to the system, not whether they read every line.
- **Stated intent block.** Title and description go inside
  `<pr_description>...</pr_description>` tags, not a code fence, because bodies
  often contain fences. The prompt says this text is the author's claims to
  check against the diff, never instructions. With no intent, the block says
  `(no description provided)` and the slot list contains no `intent`.
- **Angle definitions.** One short paragraph per angle, with an example of a good
  question and a bad one.
- **Slot list.** Rendered as `1. intent`, `2. behavior`, and so on. Question N
  must be about angle N, and the model echoes it as `"angle"`.
- **Language rules.** Questions and options describe behavior in plain words,
  with no identifiers or file paths. Wrong options are plausible misreadings of
  what the system does, not wrong code details.
- **Evidence rules.**
  - Every correct answer must be provable from the diff.
  - The explanation cites the file or symbol that proves it.
  - For side effects, the answer must follow from code visible in the diff.
    "Other callers probably break" is not a valid correct answer.
  - When the description claims something the diff does not do, that gap is a
    good intent question.
- **Kept.** No trivia, nothing answerable from the title alone, exactly one
  correct option, options under 120 characters, JSON-only output.
- **Output example** gains `"angle"`.

The title and description are rendered once by `renderPrompt`, a single regex
pass, so a body containing `{{DIFF}}` is not expanded.

### 4. Validation (`validateQuiz`)

The signature becomes `validateQuiz(quiz, slots)`. The count check uses
`slots.length`.

For each question:

- The angle is normalised: lowercased and trimmed, with spaces and hyphens
  turned into `_`.
- It must equal `slots[i]`. A mismatch throws a `publicError` such as
  `question 2 is about "rationale", expected "behavior".` Only known angle keys
  are interpolated; an unknown value is reported as "an unknown angle".
- The normalised `angle` is kept in the returned quiz, and therefore in the
  base64 key.

A mismatch uses the existing two-attempt retry and then fails open, as any other
malformed output does.

### 5. Rendering (`comment.mjs`)

- Quiz question line: `**1.** _Intent_ — <question>`.
- Results line: `**1.** ✅ _Intent_ — <question>`.
- A question with no `angle` (keys from quizzes posted before this change) renders
  exactly as today, so old comments still grade.
- The `**N.**` prefix, option lines, submit line and markers are unchanged.
  `parseSelections`, `isSubmitted` and the workflow `contains()` filters need no
  change.

### 6. Wiring (`modes.mjs`)

`generateQuiz` calls `cleanDescription(decision.body)` and
`planSlots(inputs.questionCount, hasIntent)`. It passes `PR_TITLE`,
`PR_DESCRIPTION` and `SLOTS` to `renderPrompt`, and `slots` to `validateQuiz`.
It logs the plan: `quizme: slots intent,behavior,side_effects`.

## Security

The PR body is untrusted text in the prompt. On a non-fork PR the body's author
is someone who can already push code. The model has no tools and a sandboxed
working directory, so the worst outcome is a misleading quiz. Model output that
could echo the body (the angle) only reaches a comment after validation against
a fixed set of keys. Nothing else changes: no new secret, no new API call.

## Testing

- `slots.test.mjs`: `planSlots` for counts 1–10, with and without intent.
- `cleanDescription`: HTML comments stripped, threshold at 39/40 characters, cap
  and truncation marker, `null`/`undefined` body.
- `validateQuiz`: matching angle accepted, normalisation (`"Side effects"` →
  `side_effects`), mismatch rejected, missing angle rejected, angle kept in
  output.
- `renderQuiz`/`renderResults`: label present; `parseSelections` still reads
  labelled questions; a key with no angle renders without a label.
- `modes` generate test: `PR_DESCRIPTION` and `SLOTS` reach the prompt, and the
  no-body path plans `rationale` first.
- Existing fixtures that call `validateQuiz(quiz, n)` or build quizzes without
  `angle` are updated. Contract and e2e tests stay green.

## Rollout

1. Merge to `main`.
2. Tag a pre-release (`v1.1.0-rc.1`). `release.yml` only triggers on
   `v[0-9]+.[0-9]+.[0-9]+`, so an `-rc` tag does not move `v1`.
3. Point one real work repository at `@v1.1.0-rc.1` and use it for one to two
   weeks.
4. If the questions are better, release `v1.1.0` and move `v1`. If side-effect
   questions are still thin, revisit gathering code outside the diff.

## Docs

- README: update the "What it looks like" example to labelled, plain-language
  questions, and add a short note under Quickstart: *put the task summary in the
  PR description; quizme checks the code against it*.
- README "How it works": mention the slot plan and that the model receives the
  PR description.
