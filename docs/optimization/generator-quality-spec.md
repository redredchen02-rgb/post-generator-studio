# Generator Quality Optimization Spec

## Goal

Improve the quality of AI-generated posts through systematic prompt engineering,
pipeline step tuning, and LLM-as-Judge evaluation.

## Current State

- **Pipeline**: build-context → render-prompt → generate → clean-content → format-output
- **Variables**: `{{TITLE}}`, `{{EVENT_SUMMARY}}`, `{{DATE}}`, `{{TIME}}`, `{{LOCALE}}`
- **4 pipeline steps implemented**:
  - `build-context`: wraps request into PipelineContext
  - `render-prompt`: calls prompt-service to render system+user prompts
  - `clean-content`: post-processes generated text (removes markdown fences, trims)
  - `format-output`: applies final formatting
- **Providers**: OpenAI, Anthropic, Gemini, Ollama, OpenRouter
- **Streaming**: SSE streaming via BaseAdapter.generate()

## Quality Rubric (LLM-as-Judge)

Each generation is scored 1-5 on 5 dimensions:

| Dimension | 1 (Poor) | 3 (Adequate) | 5 (Excellent) |
|-----------|----------|---------------|---------------|
| **Relevance** | Off-topic, ignores TITLE/EVENT_SUMMARY | Mentions topic but drifts | Tight focus, every paragraph advances the topic |
| **Coherence** | Disjointed, jumps between ideas | Logical flow with minor gaps | Smooth narrative, clear progression |
| **Factuality** | Contains false claims or hallucinations | Mostly factual, minor imprecision | Accurate, well-grounded in the event summary |
| **Style** | Robotic, repetitive, or unnatural | Readable but bland | Engaging voice, appropriate tone for content type |
| **Completeness** | Abrupt ending, missing key points | Covers basics, feels incomplete | Thorough, satisfying conclusion |

### Judge Prompt (for LLM evaluator)

```
You are evaluating a generated post. Score each dimension 1-5.

Topic: {{TITLE}}
Event Summary: {{EVENT_SUMMARY}}
Generated Content:
{{CONTENT}}

Dimensions:
1. Relevance: Does the content stay focused on the topic?
2. Coherence: Is there a logical flow between ideas?
3. Factuality: Is the content accurate given the event summary?
4. Style: Is the writing engaging and natural?
5. Completeness: Does it feel complete and satisfying?

For each dimension, provide:
- Score (1-5)
- One sentence justification

Then provide an overall score (average of 5 dimensions).
```

## Optimization Experiments

### Experiment A: System Prompt Engineering
- **Hypothesis**: A more structured system prompt (role + task + format + constraints) improves all dimensions
- **Treatment**: Replace minimal system prompt with detailed role-based prompt
- **Measure**: Delta vs baseline across 10 stratified samples

### Experiment B: Context Enrichment
- **Hypothesis**: Adding {{DATE}}/{{LOCALE}} context to user prompt improves relevance
- **Treatment**: Include rich context in user prompt template
- **Measure**: Relevance + Completeness scores

### Experiment C: Clean Content Step Enhancement
- **Hypothesis**: Better post-processing improves Style and Coherence
- **Treatment**: Add section detection, consistent paragraph spacing, heading normalization
- **Measure**: Style + Coherence scores

### Experiment D: Format Output Step Enhancement
- **Hypothesis**: Structured formatting (headings, lists) improves readability
- **Treatment**: Add markdown structure rules to format-output step
- **Measure**: Completeness + Style scores

## Sampling Strategy

Stratified sampling across:
- 3 content categories (tech, business, lifestyle)
- 2 locales (zh-TW, en-US)
- 2 providers (OpenAI, Anthropic)
- = 12 samples per experiment

Each sample: fixed title + event summary, run through pipeline with baseline + treatment,
collect both outputs, run LLM-as-Judge blind comparison.

## Success Criteria

- Average quality score improvement >= 0.5 points (on 1-5 scale)
- No regression in any dimension > 0.3 points
- All winning experiments merged to main pipeline

## Implementation Notes

- Judge evaluation requires a working API key for the judge model
- Run in a separate `optimize/generator-quality` branch
- Use `ce-optimize` skill for structured experiment tracking
- Each experiment = 1 PR with before/after scores
