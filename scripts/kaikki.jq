# Kaikki.org (machine-readable Wiktionary) JSONL -> Look Up entries.
#
#   WORDTAP_WORD=<word> jq -cs -f kaikki.jq < word.jsonl
#
# The word comes from the environment, not --arg, so it never appears on jq's command line.
#
# Input is the slurped array of per-POS records for one English headword. Output
# is a JSON array of {headword,text} entries: Word parts, then one entry per
# part of speech, then Etymology (one per distinct etymology).

def strip_tree($w):
  # Long etymologies start with a rendered "Etymology tree" (one ancestor per
  # line, ending at "English <word>"). Keep only the prose that follows it.
  if startswith("Etymology tree") then
    (split("\n")) as $l
    | ([range(0; $l|length) | select($l[.] == "English " + $w)] | first) as $i
    | if $i == null then $l[1:] else $l[($i + 1):] end
    | join(" ")
  else gsub("\n"; " ") end;

def parts:
  # Morpheme breakdown from the affix/compound templates Wiktionary editors use,
  # falling back to the "By surface analysis, x + y." sentence.
  ([.etymology_templates[]?
    | select(.name | IN("affix","af","prefix","pre","suffix","suf","compound","com","confix","con","surf","blend"))
    | .expansion | sub("^By surface analysis, "; "") | select(length > 0 and length < 120)] | first)
  // ((.etymology_text // "") | capture("By surface analysis, (?<p>[^.]+)\\.").p? // empty);

def dedupe: reduce .[] as $x ([]; if index([$x]) then . else . + [$x] end);

def senses:
  [.senses[]? | select((.tags // []) | index("no-gloss") | not) | .glosses[-1]? // empty]
  | dedupe | .[:6];

($ENV.WORDTAP_WORD // "") as $word
| . as $recs
| [ ($recs | map(parts) | first // empty | {headword: "Word parts", text: .}) ]
+ [ $recs[]
    | (senses) as $s | select($s | length > 0)
    | {headword: ($word + " · " + .pos),
       text: ([$s | to_entries[] | "\(.key + 1). \(.value)"] | join(" "))} ][:5]
+ ( [ $recs[] | .etymology_text // empty | strip_tree($word) | select(length > 0) ] | dedupe as $e
    | [ range(0; $e|length) as $i
        | {headword: (if ($e|length) > 1 then "Etymology \($i + 1)" else "Etymology" end),
           text: $e[$i]} ] )
