# Test fixtures

- `commons/`, `theme*/`, `tokens-bad/`: from omarchy-plugin-template (synthetic).
- `kaikki/*.jsonl`: trimmed records from [Kaikki.org](https://kaikki.org) (machine-readable
  Wiktionary, CC BY-SA 4.0) for `unbelievable`, `bass` and `berries`. Scrub rules: public dictionary
  data only; kept fields are `word`, `pos`, `etymology_*` (the large `ety` tree template dropped) and
  the first three senses' `glosses`/`tags`/`form_of`.
