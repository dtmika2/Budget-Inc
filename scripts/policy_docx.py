"""Round-trip policy cards and regional compromise cards through Word.

  python scripts/policy_docx.py export            -> exports/policies/<file>.docx (one per data/policies/*.json)
                                                     exports/compromises/<file>.docx (one per data/compromises/*.json)
  python scripts/policy_docx.py import <docx...>  -> writes edits back to data/policies/*.json (or
                                                     data/compromises/*.json for a document in a folder named
                                                     "compromises") and locales/cs.json

Each card is one two-column table (label | value) under a heading. For a policy card the heading is its
topic (the headline on the card), the "Název" row its name (the smaller flavour line). Texts live in
locales/cs.json under policy.<id>.topic / .title / .desc / .drivenBy / .ongoing (compromise.<id>.… for
compromises, which have no topic and no ideology), numbers in data/policies|compromises/<file>.json.
Cards removed from the document are left untouched; a table with a new ID adds a card.

Sources of truth (content/): policies/_filler.docx, policies/dummy.docx, compromises/_filler.docx,
compromises/dummy.docx. The importer is forgiving about hand edits: ranges written high-to-low are
sorted, a missing ":" or ";" between items is accepted, ideologies may be written in Czech, and a name
left as "[text] Karta M01 (…)" keeps only the text in brackets; "[FILLER]" and "(ideology)" around the
heading are dropped from the topic.
"""

import json
import re
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt
from docx.table import Table

ROOT = Path(__file__).resolve().parent.parent
LOCALE = ROOT / "locales" / "cs.json"

# Policy cards and regional compromise cards share the format; compromises have no ideology and no topic.
# A document in a folder named "compromises" imports into data/compromises, any other into data/policies.
KINDS = {
    "policies": {"data": ROOT / "data" / "policies", "out": ROOT / "exports" / "policies", "prefix": "policy", "heading": "Karty politik"},
    "compromises": {"data": ROOT / "data" / "compromises", "out": ROOT / "exports" / "compromises", "prefix": "compromise", "heading": "Regionální kompromisy"},
}


def kind_of(path):
    return "compromises" if "compromises" in (part.lower() for part in Path(path).parent.parts) else "policies"

LEANINGS = ["libertarianism", "conservatism", "populism", "socialism", "progressivism", "fascism", "communism"]
LEANINGS_CZ = {
    "libertarianismus": "libertarianism",
    "konzervatismus": "conservatism",
    "populismus": "populism",
    "socialismus": "socialism",
    "progresivismus": "progressivism",
    "fašismus": "fascism",
    "komunismus": "communism",
}
EFFECTS = ["finances", "financesExtra", "support", "coalition", "prestige"]
GROUPS = ["oligarchs", "pensioners", "media", "eu", "activists"]

L_ID = "ID"
L_TITLE = "Název"
L_DESC = "Popis"
L_DRIVEN = "Kdo prosazuje"
L_LEANING = "Ideologie"
L_LEADERS = "Dostupné pro"
L_TAGS = "Tagy"
L_EFFECTS = "Efekty"
L_ANGER = "Hněv skupin"
L_BUDGET = "Rozpočet"
L_ONGOING = "Trvalý efekt"
L_ONGOING_TEXT = "Trvalý efekt – popisek"
L_REGIONS = "Regiony"
L_PC = "PC"
L_CHAOS = "Chaos události"
L_DEV = "Jen pro vývoj"

GUIDE = [
    "Každá karta je jedna tabulka. Měňte jen pravý sloupec. Prázdná buňka = pole se nepoužije.",
    "Rozsahy: „název: min až max“, více položek odděluje středník, např. „support: 1 až 3; coalition: -2 až 0“.",
    f"Efekty: {', '.join(EFFECTS)}. Skupiny (hněv): {', '.join(GROUPS)}.",
    f"Ideologie: {', '.join(LEANINGS)}.",
    "Rozpočet: „kapitola revenue|expenditure procento“, např. „398 revenue -3; 313 expenditure 5“.",
    "Trvalý efekt: „cíl: denní hodnota / den, počet dní“, např. „support: 0.04 / den, 120 dní“. "
    "Řádek „Trvalý efekt – popisek“ hned pod ním je jeho text. Další trvalý efekt = přidejte další dvojici řádků.",
    "Seznamy (Dostupné pro, Tagy, Chaos události) oddělujte čárkou. Jen pro vývoj: ano / ne.",
    "Novou kartu přidáte zkopírováním celé tabulky a změnou ID (malá písmena, číslice, podtržítko).",
]

GUIDE_COMPROMISES = [
    "Každý kompromis je jedna tabulka. Měňte jen pravý sloupec. Prázdná buňka = pole se nepoužije.",
    "Regiony (povinné, aspoň jeden kraj): „kód kraje: min až max“, např. „CZ010: 4 až 6; CZ080: -3 až -2“.",
    "Rozsahy: „název: min až max“, více položek odděluje středník.",
    f"Efekty: {', '.join(EFFECTS)}. Skupiny (hněv): {', '.join(GROUPS)}.",
    "Rozpočet: „kapitola revenue|expenditure procento“, např. „398 revenue -3; 313 expenditure 5“.",
    "Seznamy (Dostupné pro, Tagy, Chaos události) oddělujte čárkou. Jen pro vývoj: ano / ne.",
    "Nový kompromis přidáte zkopírováním celé tabulky a změnou ID (malá písmena, číslice, podtržítko).",
]


# ---------- formatting ----------

def num(v):
    return str(int(v)) if float(v).is_integer() else repr(float(v))


def fmt_ranges(d):
    return "; ".join(f"{k}: {num(r['min'])} až {num(r['max'])}" for k, r in (d or {}).items())


def fmt_budget(lst):
    return "; ".join(f"{b['chapter']} {b['type']} {num(b['changePct'])}" for b in (lst or []))


def fmt_ongoing(o):
    return f"{o['target']}: {num(o['perDay'])} / den, {o['days']} dní"


# ---------- parsing ----------

def clean(s):
    # Word autocorrect turns hyphens into dashes and adds non-breaking spaces
    return s.replace("–", "-").replace("—", "-").replace("−", "-").replace(" ", " ").strip()


NUM = r"[-+]?\d+(?:[.,]\d+)?"


def to_num(s):
    v = float(s.replace(",", "."))
    return int(v) if v.is_integer() else v


def parse_list(s):
    return [x.strip() for x in clean(s).split(",") if x.strip()]


RANGE_ITEM = re.compile(rf"(\w+)\s*:?\s*({NUM})(?:\s*(?:až|\.\.)\s*({NUM}))?")


def parse_ranges(s, allowed, where):
    """`key: a až b; key: c` — also accepts a missing ":" or ";" and ranges written high-to-low (sorted)."""
    out = {}
    s = clean(s)
    pos = 0
    for m in RANGE_ITEM.finditer(s):
        gap = s[pos : m.start()]
        if gap.strip(" ;,"):
            raise ValueError(f"{where}: nečitelné „{gap.strip()}“")
        pos = m.end()
        key, lo, hi = m.group(1), to_num(m.group(2)), to_num(m.group(3) or m.group(2))
        if allowed and key not in allowed:
            raise ValueError(f"{where}: neznámé „{key}“ (povolené: {', '.join(allowed)})")
        out[key] = {"min": min(lo, hi), "max": max(lo, hi)}
    if s[pos:].strip(" ;,"):
        raise ValueError(f"{where}: nečitelné „{s[pos:].strip()}“")
    return out


def parse_budget(s, where):
    out = []
    for part in filter(None, (p.strip() for p in clean(s).split(";"))):
        m = re.fullmatch(rf"(\S+)\s+(revenue|expenditure)\s+({NUM})\s*%?", part)
        if not m:
            raise ValueError(f"{where}: nečitelné „{part}“")
        out.append({"chapter": m.group(1), "type": m.group(2), "changePct": to_num(m.group(3))})
    return out


def parse_ongoing(s, where):
    m = re.fullmatch(rf"([\w.]+)\s*:\s*({NUM})\s*/\s*den\s*,\s*(\d+)\s*dn(?:í|i|y|u)?", clean(s))
    if not m:
        raise ValueError(f"{where}: nečitelné „{s}“")
    return {"target": m.group(1), "perDay": to_num(m.group(2)), "days": int(m.group(3))}


# ---------- export ----------

def cell_text(cell):
    return "\n".join(p.text for p in cell.paragraphs).strip()


def card_tables(doc):
    """Card tables with the heading right above each of them."""
    out, heading = [], ""
    for el in doc.element.body.iterchildren():
        if el.tag == qn("w:p"):
            text = "".join(t.text or "" for t in el.iter(qn("w:t"))).strip()
            if text:
                heading = text
        elif el.tag == qn("w:tbl"):
            table = Table(el, doc)
            if table.rows and cell_text(table.rows[0].cells[0]) == L_ID:
                out.append((table, heading))
            heading = ""
    return out


def topic_from_heading(heading):
    t = clean(heading)
    t = re.sub(r"^\[FILLER\]\s*", "", t)
    t = re.sub(r"\s*\((?:" + "|".join(LEANINGS_CZ) + r")\)\s*$", "", t)
    return t


def name_from_title(title):
    """A name left as "[text] Karta M01 (…)" (the filler placeholder with its word replaced) keeps the text."""
    m = re.fullmatch(r"\[(.+)\]\s*Karta\s+[MA]\d+\b.*", clean(title), re.S)
    return m.group(1).strip() if m else title.strip()


def export():
    for kind in KINDS:
        export_kind(kind)


def export_kind(kind):
    k = KINDS[kind]
    texts = json.loads(LOCALE.read_text(encoding="utf-8"))
    k["out"].mkdir(parents=True, exist_ok=True)
    for path in sorted(k["data"].glob("*.json")):
        cards = json.loads(path.read_text(encoding="utf-8"))
        doc = Document()
        doc.styles["Normal"].font.size = Pt(10)
        doc.add_heading(f"{k['heading']} – {path.name}", 0)
        for line in GUIDE if kind == "policies" else GUIDE_COMPROMISES:
            doc.add_paragraph(line, style="List Bullet")
        for c in cards:
            doc.add_heading(texts.get(c.get("topic", ""), "") or texts.get(c["title"], c["id"]), 2)
            rows = [
                (L_ID, c["id"]),
                (L_TITLE, texts.get(c["title"], "")),
                (L_DESC, texts.get(c["description"], "")),
                (L_DRIVEN, texts.get(c["drivenBy"], "")),
            ]
            if kind == "policies":
                rows.append((L_LEANING, c["leaning"]))
            rows += [
                (L_LEADERS, ", ".join(c["availableFor"])),
                (L_TAGS, ", ".join(c.get("tags", []))),
                (L_EFFECTS, fmt_ranges(c.get("effects"))),
                (L_ANGER, fmt_ranges(c.get("anger"))),
                (L_BUDGET, fmt_budget(c.get("budgetChanges"))),
            ]
            for o in c.get("ongoing", []):
                rows.append((L_ONGOING, fmt_ongoing(o)))
                rows.append((L_ONGOING_TEXT, texts.get(o.get("label", ""), "")))
            rows += [
                (L_REGIONS, fmt_ranges(c.get("regions"))),
                (L_PC, num(c["pc"]) if "pc" in c else ""),
                (L_CHAOS, ", ".join(c.get("chaosEvents", []))),
                (L_DEV, "ano" if c.get("devOnly") else "ne"),
            ]
            table = doc.add_table(rows=0, cols=2)
            table.style = "Table Grid"
            for label, value in rows:
                r = table.add_row().cells
                r[0].text = label
                r[0].paragraphs[0].runs[0].bold = True
                r[1].text = value
        out = k["out"] / f"{path.stem}.docx"
        doc.save(out)
        print(f"{out.relative_to(ROOT)}: {len(cards)} karet")


# ---------- import ----------

def read_card(table, where, heading="", kind="policies"):
    rows = [(cell_text(r.cells[0]), cell_text(r.cells[1])) for r in table.rows]
    fields, ongoing = {}, []
    for label, value in rows:
        if label == L_ONGOING:
            ongoing.append([value, ""])
        elif label == L_ONGOING_TEXT:
            if not ongoing:
                raise ValueError(f"{where}: „{L_ONGOING_TEXT}“ bez řádku „{L_ONGOING}“ nad ním")
            ongoing[-1][1] = value
        else:
            fields[label] = value
    cid = clean(fields.get(L_ID, ""))
    if not re.fullmatch(r"[a-z0-9_]+", cid):
        raise ValueError(f"{where}: neplatné ID „{cid}“")
    where = f"{where} ({cid})"
    leaning = None
    if kind == "policies":
        leaning = clean(fields.get(L_LEANING, ""))
        leaning = LEANINGS_CZ.get(leaning.lower(), leaning)
        if leaning not in LEANINGS:
            raise ValueError(f"{where}: neznámá ideologie „{leaning}“")
    dev = clean(fields.get(L_DEV, "ne")).lower()
    if dev not in ("ano", "ne"):
        raise ValueError(f"{where}: „{L_DEV}“ musí být ano/ne")
    return {
        "id": cid,
        "texts": {
            "topic": topic_from_heading(heading) if kind == "policies" else "",
            "title": name_from_title(fields.get(L_TITLE, "")),
            "desc": fields.get(L_DESC, "").strip(),
            "drivenBy": fields.get(L_DRIVEN, "").strip(),
        },
        "leaning": leaning,
        "availableFor": parse_list(fields.get(L_LEADERS, "")),
        "tags": parse_list(fields.get(L_TAGS, "")),
        "effects": parse_ranges(fields.get(L_EFFECTS, ""), EFFECTS, f"{where} {L_EFFECTS}"),
        "anger": parse_ranges(fields.get(L_ANGER, ""), GROUPS, f"{where} {L_ANGER}"),
        "budgetChanges": parse_budget(fields.get(L_BUDGET, ""), f"{where} {L_BUDGET}"),
        "ongoing": [(parse_ongoing(v, f"{where} {L_ONGOING}"), t) for v, t in ongoing],
        "regions": parse_ranges(fields.get(L_REGIONS, ""), None, f"{where} {L_REGIONS}"),
        "pc": to_num(clean(fields[L_PC])) if clean(fields.get(L_PC, "")) else None,
        "chaosEvents": parse_list(fields.get(L_CHAOS, "")),
        "devOnly": dev == "ano",
    }


def apply(card, new, texts, kind="policies"):
    """Update `card` (dict from JSON, key order kept) with values read from Word; returns it."""
    prefix = KINDS[kind]["prefix"]
    cid = new["id"]
    card["id"] = cid
    for field, key in (("title", "title"), ("description", "desc"), ("drivenBy", "drivenBy")):
        card.setdefault(field, f"{prefix}.{cid}.{key}")
        texts[card[field]] = new["texts"][key]
    topic = new["texts"]["topic"]
    # a heading that just repeats the name (cards without a topic) is not a topic
    if topic and clean(topic) != clean(new["texts"]["title"]):
        card["topic"] = card.get("topic") or f"{prefix}.{cid}.topic"
        texts[card["topic"]] = topic
    elif "topic" in card:
        texts.pop(card.pop("topic"), None)
    if new["leaning"]:
        card["leaning"] = new["leaning"]
    card["availableFor"] = new["availableFor"]
    old_ongoing = card.get("ongoing", [])
    ongoing = []
    for i, (o, text) in enumerate(new["ongoing"]):
        label = old_ongoing[i].get("label") if i < len(old_ongoing) else None
        if text:
            label = label or f"{prefix}.{cid}.ongoing" + (str(i + 1) if i else "")
            texts[label] = text
            o["label"] = label
        ongoing.append(o)
    for key, value in (
        ("tags", new["tags"]),
        ("effects", new["effects"]),
        ("anger", new["anger"]),
        ("budgetChanges", new["budgetChanges"]),
        ("ongoing", ongoing),
        ("regions", new["regions"]),
        ("pc", new["pc"]),
    ):
        if value in (None, [], {}):
            card.pop(key, None)
        else:
            card[key] = value
    if new["chaosEvents"] or "chaosEvents" in card:
        card["chaosEvents"] = new["chaosEvents"]
    card["devOnly"] = new["devOnly"]
    return card


def import_(paths):
    texts = json.loads(LOCALE.read_text(encoding="utf-8"))
    texts_before = json.dumps(texts, ensure_ascii=False)
    seen, writes = set(), []
    for p in map(Path, paths):
        kind = kind_of(p)
        target = KINDS[kind]["data"] / f"{p.stem}.json"
        if not target.exists():
            sys.exit(f"{p.name}: k němu neexistuje {target.relative_to(ROOT)} (název souboru musí zůstat stejný)")
        cards = json.loads(target.read_text(encoding="utf-8"))
        by_id = {c["id"]: c for c in cards}
        found = []
        for i, (t, heading) in enumerate(card_tables(Document(p)), 1):
            new = read_card(t, f"{p.name} tabulka {i}", heading, kind)
            if (kind, new["id"]) in seen:
                sys.exit(f"{p.name}: ID „{new['id']}“ je v dokumentech dvakrát")
            seen.add((kind, new["id"]))
            found.append(new["id"])
            if new["id"] in by_id:
                apply(by_id[new["id"]], new, texts, kind)
            else:
                cards.append(apply({}, new, texts, kind))
                print(f"  + nová karta {new['id']}")
        for missing in sorted(set(by_id) - set(found)):
            print(f"  ! {missing} v dokumentu chybí – ponechána beze změny")
        before = json.loads(target.read_text(encoding="utf-8"))
        if before != cards:
            writes.append((target, cards))
        else:
            print(f"{target.relative_to(ROOT)}: beze změny")
    # write only once every document parsed cleanly
    if json.dumps(texts, ensure_ascii=False) != texts_before:
        writes.append((LOCALE, texts))
    for target, data in writes:
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{target.relative_to(ROOT)}: uloženo")
    print("Hotovo. Ověřte: npm test")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    if len(sys.argv) >= 2 and sys.argv[1] == "export":
        export()
    elif len(sys.argv) >= 3 and sys.argv[1] == "import":
        try:
            import_(sys.argv[2:])
        except ValueError as e:
            sys.exit(f"Chyba: {e}")
    else:
        sys.exit(__doc__)
