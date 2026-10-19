# Test fixtures

- `commons/`, `theme*/`, `tokens-bad/`: from omarchy-plugin-template (synthetic).
- `kaikki/*.jsonl`: trimmed records from [Kaikki.org](https://kaikki.org) (machine-readable
  Wiktionary, CC BY-SA 4.0) for `unbelievable`, `bass` and `berries`. Scrub rules: public dictionary
  data only; kept fields are `word`, `pos`, `etymology_*` (the large `ety` tree template dropped) and
  the first three senses' `glosses`/`tags`/`form_of`.
  `schön.jsonl` comes from the all-languages edition (Bavarian, Central Franconian and German
  records; kept fields `word`, `lang`, `pos`, `etymology_text` and the first three senses).
- `phrase/*.png`: synthetic, rendered with ImageMagick/Pango: one line of made-up text with
  "New York City" highlighted, in a light monospace and a dark sans-serif theme at the small size a
  scale-1 4K screen shows; `accents.png` the same with "Hôtel de Ville" highlighted. No screenshots of
  a real desktop.
