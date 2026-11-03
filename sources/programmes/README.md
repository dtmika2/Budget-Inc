# Party programmes (source material)

Real party programmes go here. Party demands in `data/demands/*.json` are written from them
(`assignment-regions-and-demands.md`, C5a). These files are **source material only**: they are never
bundled into the game and never loaded at runtime (Vite only bundles `data/**/*.json`).

## Layout

```
sources/programmes/<party-id>/          # party id from data/parties.json, e.g. ano, ods
  program-2024-kraje.pdf                # one file per programme (PDF, DOCX or text)
  meta.json
```

`meta.json`:

```json
{
  "party": "ano",
  "documents": [
    { "file": "program-2024-kraje.pdf", "title": "…", "year": 2024, "level": "regional", "region": "CZ041" }
  ]
}
```

`level` is `national` or `regional`; a regional programme names its region (kraj code).

## Linking a demand to its programme

Every party demand that is not `[DUMMY]` needs a `programmeRef`:

```json
"programmeRef": { "party": "ano", "file": "program-2024-kraje.pdf", "page": 12, "section": "Doprava", "quote": "short quote" }
```

The loader rejects a non-DUMMY party demand without `programmeRef`; a test checks that the file exists here.

## Workflow

1. Upload the programmes here.
2. Draft demands from concrete programme points, each with its `programmeRef`, `"status": "DRAFT"`.
   Drafts only load with `config.includeDevFiller`.
3. Daniel reviews; approved demands get `"status": "APPROVED"`.

Guardrails: paraphrase programme points into short game demands; never attribute invented positions to
a real party; no real people's names (`CLAUDE.md` rule 4).
