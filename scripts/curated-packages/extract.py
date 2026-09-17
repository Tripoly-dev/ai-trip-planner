import re
import json
import sys

DESTINATIONS = {
    "Thailand": "/tmp/tripoly_pdfs/Thailand.txt",
    "Bali": "/tmp/tripoly_pdfs/Bali.txt",
    "Dubai": "/tmp/tripoly_pdfs/Dubai.txt",
}

# Matches the header block present once per package, identically shaped across all three
# files (confirmed by direct reading): "DESTINATION  <x>" then "DURATION  <N> Nights? / <M> Days?"
#
# Tolerant of two confirmed pypdf extraction glitches (stray spaces inserted by source PDF
# kerning, not real content issues — see run-1 findings): a space inside "DURATION" itself
# (observed as "DURAT ION"), and a space inside a 1-2 digit night/day count (observed as
# "0 9"). Nights/days are captured as 1-2 digits with an optional internal space and the
# space is stripped before int() at the call site. Destination name additionally allows
# "&" and "/" (observed: "Dubai & Abu Dhabi").
HEADER_RE = re.compile(
    r"DESTINATION\s*\n?\s*([A-Za-z][A-Za-z \-&/]*?)\s*\n\s*DURAT\s*ION\s*\n?\s*(\d\s?\d?)\s*Nights?\s*/\s*(\d\s?\d?)\s*Days?",
    re.IGNORECASE,
)

# "Day Plan"/"Meal Plan" labels tolerant of the same stray-space glitch inside "Plan"
# (observed: "Meal Pl an" — Bali "With Flights" Day 7). Without this, the non-greedy
# Day-Plan-text group backtracks past the intended boundary looking for a literal match
# and swallows the following day's entire block.
DAY_RE = re.compile(
    r"Day\s*(\d+)\s*:\s*\n?"
    r"Day\s*Pl\s*an\s*:?\s*(.*?)\n"
    r"Meal\s*Pl\s*an\s*:\s*(.*?)\n"
    r"(.*?)"
    r"(?=\n\s*Day\s*\d+\s*:|\n\s*No of Nights|\n\s*Tour Cost|\n\s*Hotels\s*\n|\Z)",
    re.DOTALL,
)

OPTIONAL_ACTIVITIES_RE = re.compile(r"Optional Activities on this Day\s*:?\s*(.*)", re.DOTALL)

CITY_NIGHTS_RE = re.compile(r"([A-Za-z][A-Za-z .]+?)\s+(\d+)N\b")

TIER_ROW_RE = re.compile(
    r"(STANDARD|DELUXE|LUXURY)\s*\n?\s*₹?\s*([\d,]+)\s*\n?\s*₹?\s*([\d,]+)", re.IGNORECASE
)


def clean(s: str) -> str:
    # Strips the Private Use Area bullet glyph (U+F0FC — a Wingdings-style bullet char
    # from the source PDF's bullet font) pypdf leaves behind ahead of every inclusions
    # line; left in, it renders as a broken/tofu box in the app or PDF.
    s = re.sub(r"[-]", "", s)
    return re.sub(r"[ \t]+", " ", re.sub(r"\s*\n\s*", " ", s)).strip(" -–—:")


def split_bullets(block: str) -> list[str]:
    # Inclusions/Exclusions render as one line per bullet once whitespace-collapsed line by
    # line (no literal bullet glyph survives extraction) — split on the source newlines
    # BEFORE collapsing internal whitespace, then clean each line individually.
    lines = [clean(line) for line in block.split("\n")]
    return [line for line in lines if line]


def find_section(text: str, start_label: str, end_labels: list[str]) -> str:
    start = text.find(start_label)
    if start == -1:
        return ""
    start += len(start_label)
    end = len(text)
    for lbl in end_labels:
        idx = text.find(lbl, start)
        if idx != -1:
            end = min(end, idx)
    return text[start:end]


def parse_package(name: str, dest: str, nights: int, days_total: int, block: str, source: str) -> dict:
    days = []
    for m in DAY_RE.finditer(block):
        day_num = int(m.group(1))
        title = clean(m.group(2))
        meals = clean(m.group(3))
        rest = m.group(4)
        opt_m = OPTIONAL_ACTIVITIES_RE.search(rest)
        if opt_m:
            description = clean(rest[: opt_m.start()])
            optional = clean(opt_m.group(1))
        else:
            description = clean(rest)
            optional = ""
        days.append(
            {
                "day": day_num,
                "title": title,
                "meals": meals,
                "description": description,
                "optionalActivities": optional or None,
            }
        )

    # Cities + nights — from the short "City N / City2 M" summary line right under the
    # package title, e.g. "Pattaya 2N / Bangkok 2N".
    summary_line = ""
    for line in block.split("\n")[:6]:
        if CITY_NIGHTS_RE.search(line):
            summary_line = line
            break
    cities = [{"city": c.strip(), "nights": int(n)} for c, n in CITY_NIGHTS_RE.findall(summary_line)]

    hotels_block = find_section(block, "Hotels", ["Tour Cost"])
    hotel_city_row = re.search(r"City\s+(.+)", hotels_block)
    hotel_cities = re.split(r"\s{2,}", hotel_city_row.group(1).strip()) if hotel_city_row else []

    # Almost every package labels its price table "Tour Cost" — one confirmed exception
    # (Thailand "Serene Samui Escape") uses "Package Cost Per Person" instead, same table
    # shape underneath. Try the common label first, fall back to the alternate.
    cost_block = find_section(block, "Tour Cost", ["Inclusions"])
    if not cost_block.strip():
        cost_block = find_section(block, "Package Cost Per Person", ["Inclusions"])
    tiers = {}
    for tier, adult, child in TIER_ROW_RE.findall(cost_block):
        tiers[tier.upper()] = {
            "adult": int(adult.replace(",", "")),
            "child": int(child.replace(",", "")),
        }

    inclusions_block = find_section(block, "Inclusions:", ["Exclusions:"])
    exclusions_block = find_section(block, "Exclusions:", ["\f", "Balinese", "Explore", "Discover"])
    # Cap exclusions at a generous length instead — the "next package name" sentinel above
    # is unreliable (names vary per destination); exclusions lists are consistently short.
    exclusions_block = exclusions_block[:1200]

    return {
        "id": re.sub(r"[^a-z0-9]+", "-", f"{dest}-{name}".lower()).strip("-"),
        "destination": dest,
        "name": name,
        "durationNights": nights,
        "durationDays": days_total,
        "cities": cities,
        "days": days,
        "hotelCities": hotel_cities,
        "costByTier": tiers,
        "inclusions": split_bullets(inclusions_block),
        "exclusions": split_bullets(exclusions_block),
        "sourceFile": source,
    }


def validate(pkg: dict) -> list[str]:
    errors = []
    day_nums = [d["day"] for d in pkg["days"]]
    expected = list(range(1, pkg["durationDays"] + 1))
    if day_nums != expected:
        errors.append(f"day sequence {day_nums} != expected {expected}")
    if not pkg["costByTier"]:
        errors.append("no cost tiers parsed")
    if not pkg["days"]:
        errors.append("no days parsed")
    for d in pkg["days"]:
        if len(d["description"]) < 15:
            errors.append(f"day {d['day']} description suspiciously short: {d['description']!r}")
    return errors


def main():
    all_valid = []
    all_rejected = []
    for dest, path in DESTINATIONS.items():
        text = open(path).read()
        headers = list(HEADER_RE.finditer(text))
        print(f"\n=== {dest}: {len(headers)} package headers found ===")
        for i, hm in enumerate(headers):
            pkg_dest = hm.group(1).strip()
            nights = int(re.sub(r"\s+", "", hm.group(2)))
            days_total = int(re.sub(r"\s+", "", hm.group(3)))
            block_start = hm.end()
            block_end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
            block = text[block_start:block_end]
            # Package name: the contiguous non-blank line(s) just before "DESTINATION" in
            # the raw text. Usually one line, but confirmed one exception (Bali's first
            # package: "Balinese Serenity" / "With Flights" on two consecutive lines with
            # no blank between them) — walk upward collecting contiguous non-blank lines,
            # stopping at a blank line or a bare page-number line.
            raw_lines = text[: hm.start()].split("\n")
            idx = len(raw_lines) - 1
            while idx >= 0 and not raw_lines[idx].strip():
                idx -= 1
            title_lines = []
            while idx >= 0 and raw_lines[idx].strip() and not re.fullmatch(r"\d+", raw_lines[idx].strip()):
                title_lines.append(raw_lines[idx].strip())
                idx -= 1
            name = " ".join(reversed(title_lines)) if title_lines else f"package-{i+1}"

            pkg = parse_package(name, dest, nights, days_total, block, f"Tripoly {dest}.pdf")
            errors = validate(pkg)
            status = "OK" if not errors else "REJECTED"
            print(f"  [{status}] {name} ({nights}N/{days_total}D) - {len(pkg['days'])} days parsed")
            if errors:
                for e in errors:
                    print(f"      - {e}")
                all_rejected.append({"destination": dest, "name": name, "errors": errors})
            else:
                all_valid.append(pkg)

    print(f"\n\nTOTAL VALID: {len(all_valid)}   TOTAL REJECTED: {len(all_rejected)}")
    json.dump(all_valid, open("/tmp/tripoly_pdfs/curated_packages.json", "w"), indent=2)
    json.dump(all_rejected, open("/tmp/tripoly_pdfs/rejected_packages.json", "w"), indent=2)


if __name__ == "__main__":
    main()
