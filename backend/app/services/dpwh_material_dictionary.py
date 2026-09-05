import re
from dataclasses import dataclass
from difflib import SequenceMatcher


@dataclass(frozen=True)
class DpwhDictionaryMatch:
    canonical_name: str
    category_type: str
    unit: str
    confidence: float


def _canonical_text(value: str) -> str:
    text = (value or "").strip().lower()
    replacements = [
        (r"\brcp\b", "reinforced concrete pipe"),
        (r"\breinf(?:orced)?\.?\s+conc(?:rete)?\.?\s+pipe\b", "reinforced concrete pipe"),
        (r"\bg\.?\s*i\.?\s+pipe\b", "gi pipe"),
        (r"\bsch(?:edule)?\.?\s*40\b", "schedule 40"),
        (r"\bcut[-\s]*back\s*asphalt\b", "cut-back asphalt"),
        (r"\brc\s*[- ]?\s*(70|250|800|3000)\b", r"rc\1"),
        (r"\bmc\s*[- ]?\s*(70|250|800|3000)\b", r"mc\1"),
        (r"\bss\s*[- ]?\s*1\b", "ss1"),
        (r"\bcrs\s*[- ]?\s*2\b", "crs2"),
        (r"\bclass\s*iv\b", "class 4"),
        (r"\bpenetration\s*grade\b", "penetration grade"),
        (r"\bbase\s*course\b", "basecourse"),
        (r"\bsub\s*base\b", "subbase"),
        (r"\bquick[-\s]*drying\s*enamel\s*paint\b", "quick drying enamel paint"),
        (r"\bcut[-\s]*back\s*asphalt\b|\bcut[-\s]*backasphalt\b", "cut-back asphalt"),
        (r"\bemulsified\s*asphalt\b|\bemulsifiedasphalt\b", "emulsified asphalt"),
        (r"\bcoco\s*lumber(?:e)?\b|\bcocolumbere\b", "coco lumber"),
        (r"\bconcrete\s*nail\b|\bconcretenail\b", "concrete nail"),
        (r"\brc\s*b00\b|\brcb00\b", "rc800"),
        (r"\brc\s*3000\s+0\b", "rc3000"),
        (r"\bcationic\s*sst\s*i\s*swt\b", "cationic ss1"),
        (r"\bcationic\s*crs\s*2\.2\b|\bcationiccrs\s*2\.2\b", "cationic crs2"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = text.replace("°", '"')
    text = re.sub(r"(\d(?:\.\d+)?)\s*mm\b", r"\1mm", text)
    text = re.sub(r"(\d(?:\.\d+)?)\s*kg\b", r"\1kg", text)
    text = re.sub(r"(\d(?:\.\d+)?)\s*psi\b", r"\1psi", text)
    text = re.sub(r"[\"'(),./-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


DPWH_MATERIAL_PATTERNS: list[tuple[re.Pattern[str], str, str, str]] = [
    (re.compile(r"\bcommon\s+borrow\b", re.I), "COMMON BORROW", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\bselected\s+borrow\b", re.I), "SELECTED BORROW", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\baggregate\s+subbase\s+course\b", re.I), "AGGREGATE SUBBASE COURSE", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\baggregate\s+basecourse\b.*\bcrushed\b|\baggregate\s+base\s+course\b.*\bcrushed\b", re.I), "AGGREGATE BASECOURSE (CRUSHED)", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\baggregate\s+surface\s+course\b.*\bcrushed\b", re.I), "AGGREGATE SURFACE COURSE (CRUSHED)", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\baggregate\s+surface\s+course\b", re.I), "AGGREGATE SURFACE COURSE", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\bgravel\b.*\b3/4\b|\bgravel\b.*\b20\s*mm\b", re.I), 'GRAVEL, 3/4" (MAX. 20 mm)', "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\bstone,\s*class\s*b\b", re.I), "STONE, CLASS B (30 - 70 kg)", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\bstone,\s*class\s*c\b", re.I), "STONE, CLASS C (60 - 100 kg)", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\bstone,\s*class\s*d\b", re.I), "STONE, CLASS D (100 - 200 kg)", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\basphalt\s+cement\b.*\bpenetration\s*grade\s*30\s*[- ]\s*50\b", re.I), "ASPHALT CEMENT, PENETRATION GRADE 30-50", "Others", "MTON"),
    (re.compile(r"\basphalt\s+cement\b.*\bpenetration\s*grade\s*65\s*[- ]\s*100\b", re.I), "ASPHALT CEMENT, PENETRATION GRADE 65-100", "Others", "MTON"),
    (re.compile(r"\basphalt\s+cement\b.*\bpenetration\s*grade\s*120\s*[- ]\s*1500?\b", re.I), "ASPHALT CEMENT, PENETRATION GRADE 120-150", "Others", "MTON"),
    (re.compile(r"\basphalt\s+concrete\b.*\bcold[-\s]*laid\b", re.I), "ASPHALT CONCRETE, COLD-LAID (PLANT MIX)", "Others", "MTON"),
    (re.compile(r"\basphalt\b.*\bmc\s*30\b|\basphalt\b.*\bmc30\b", re.I), "ASPHALT, MC30", "Others", "MTON"),
    (re.compile(r"\basphalt\b.*\bmc\s*800\b|\basphalt\b.*\bmc800\b", re.I), "ASPHALT, MC800", "Others", "MTON"),
    (re.compile(r"\bgi pipe\b.*\bschedule\s*40\b", re.I), "GI PIPE, SCHEDULE 40", "Plumbing & Pipework", "PC"),
    (re.compile(r"\bpvc pipe\b", re.I), "PVC PIPE", "Plumbing & Pipework", "PC"),
    (re.compile(r"\breinforced concrete pipe\b|\brcp\b", re.I), "REINFORCED CONCRETE PIPE", "Concrete & Masonry", "PC"),
    (re.compile(r"\bcut[-\s]*back\s*asphalt\b.*\brc\s*800\b|\bcut[-\s]*back\s*asphalt\b.*\brc800\b|\bcut[-\s]*back\s*asphalt\b.*\brcb00\b", re.I), "CUT-BACK ASPHALT, RC800", "Others", "MTON"),
    (re.compile(r"\bcut[-\s]*back\s*asphalt\b.*\brc\s*3000\b|\bcut[-\s]*back\s*asphalt\b.*\brc3000\b", re.I), "CUT-BACK ASPHALT, RC3000", "Others", "MTON"),
    (re.compile(r"\basphalt\b.*\brc\s*70\b|\basphalt\b.*\brc70\b", re.I), "ASPHALT, RC70", "Others", "MTON"),
    (re.compile(r"\basphalt\b.*\bmc\s*70\b|\basphalt\b.*\bmc70\b", re.I), "ASPHALT, MC70", "Others", "MTON"),
    (re.compile(r"\bemulsified asphalt\b.*\bss\s*1\b|\bemulsified asphalt\b.*\bss1\b", re.I), "EMULSIFIED ASPHALT, CATIONIC SS-1", "Others", "MTON"),
    (re.compile(r"\bemulsified asphalt\b.*\bcrs\s*2\b|\bemulsified asphalt\b.*\bcrs2\b", re.I), "EMULSIFIED ASPHALT, CATIONIC CRS-2", "Others", "MTON"),
    (re.compile(r"\bemulsified asphalt\b.*\bcrs\s*1\b|\bemulsified asphalt\b.*\bcrs1\b", re.I), "EMULSIFIED ASPHALT, CATIONIC CRS-1", "Others", "MTON"),
    (re.compile(r"\bar\s*/\s*asphalt\s+paint\b|\basphalt\s+paint\b", re.I), "AR / ASPHALT PAINT", "Paints, Coatings & Sealants", "GAL"),
    (re.compile(r"\bmasonry\s+cement\b.*\bhydrated\s+lime\b", re.I), "MASONRY CEMENT / HYDRATED LIME, TYPE N (40 kg)", "Concrete & Masonry", "KG"),
    (re.compile(r"\bcement,\s*type\s*1p\b|\bcement\b.*\btype\s*1p\b", re.I), "CEMENT, TYPE 1P (40 kg)", "Concrete & Masonry", "KG"),
    (re.compile(r"\bchb\b|\bconcrete hollow block\b", re.I), "CONCRETE HOLLOW BLOCK", "Concrete & Masonry", "PC"),
    (re.compile(r"\bcement\s+waterproofing\s+compound\b", re.I), "CEMENT WATERPROOFING COMPOUND", "Insulation & Waterproofing", "KG"),
    (re.compile(r"\bconcrete\s+epoxy\b", re.I), "CONCRETE EPOXY (PART A & B SET)", "Adhesives & Tapes", "GAL"),
    (re.compile(r"\bconcrete\s+neutralizer\b|\booncrete\s*neutralizer\b", re.I), "CONCRETE NEUTRALIZER", "Concrete & Masonry", "LTR"),
    (re.compile(r"\bcuring\s+compound\b", re.I), "CURING COMPOUND", "Concrete & Masonry", "LTR"),
    (re.compile(r"\bpvc\s+solvent\s+cement\b", re.I), "PVC SOLVENT CEMENT", "Adhesives & Tapes", "LTR"),
    (re.compile(r"\brust\s+converter\s*/\s*remover\b", re.I), "RUST CONVERTER/REMOVER", "Paints, Coatings & Sealants", "GAL"),
    (re.compile(r"\bdiesel\s+gear\s+oil\b", re.I), "DIESEL GEAR OIL", "Others", "LTR"),
    (re.compile(r"\bdiesel\b", re.I), "DIESEL", "Others", "LTR"),
    (re.compile(r"\bgasoline\b.*\bpremium\b", re.I), "GASOLINE, PREMIUM", "Others", "LTR"),
    (re.compile(r"\bgasoline\b.*\bregular\b", re.I), "GASOLINE, REGULAR", "Others", "LTR"),
    (re.compile(r"\bgrease\b", re.I), "GREASE", "Others", "LTR"),
    (re.compile(r"\bkerosene\b", re.I), "KEROSENE", "Others", "LTR"),
    (re.compile(r"\bliquefied\s+petroleum\s+gas\b|\blpg\b", re.I), "LIQUEFIED PETROLEUM GAS (LPG)", "Others", "LTR"),
    (re.compile(r"\bconcrete\s+nail\b", re.I), "CONCRETE NAIL, ASSORTED", "Hardware & Fasteners", "KG"),
    (re.compile(r"\bcoco\s+lumber\b|\bcocolumber\b", re.I), "COCO LUMBER E.T.", "Timber & Lumber", "BDFT"),
    (re.compile(r"\bgood\s+lumber\b", re.I), "GOOD LUMBER", "Timber & Lumber", "BDFT"),
    (re.compile(r"\bform\s+oil\b", re.I), "FORM OIL", "Others", "LTR"),
    (re.compile(r"\bmarine\s+plywood\b", re.I), "MARINE PLYWOOD", "Timber & Lumber", "PC"),
    (re.compile(r"\bordinary\s+plywood\b", re.I), "ORDINARY PLYWOOD", "Timber & Lumber", "PC"),
    (re.compile(r"\bsteel\s+form\b", re.I), "STEEL FORM", "Reinforcement & Steel", "M"),
    (re.compile(r"\bepoxy\s+primer\b", re.I), "EPOXY PRIMER WITH CATALYST (SET)", "Paints, Coatings & Sealants", "GAL"),
    (re.compile(r"\bred\s+oxide\s+metal\s+primer\b", re.I), "RED OXIDE METAL PRIMER", "Paints, Coatings & Sealants", "LTR"),
    (re.compile(r"\bprimer\b", re.I), "PRIMER", "Paints, Coatings & Sealants", "LTR"),
    (re.compile(r"\blatex\s+paint\b.*\bsemi[-\s]*gloss\b", re.I), "LATEX PAINT, SEMI-GLOSS", "Paints, Coatings & Sealants", "GAL"),
    (re.compile(r"\bstone,\s*class\s*[bcd]\b", re.I), "STONE", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\baggregate\b", re.I), "AGGREGATE", "Masonry Units & Blocks", "CUM"),
    (re.compile(r"\bquick[-\s]*drying\s*enamel\s*paint\b", re.I), "Quick-Drying Enamel Paint", "Paints, Coatings & Sealants", "GAL"),
    (re.compile(r"\blacquer\s+thinner\b", re.I), "LACQUER THINNER ES AAA", "Paints, Coatings & Sealants", "GAL"),
    (re.compile(r"\bpaint\s+thinner\b", re.I), "PAINT THINNER", "Paints, Coatings & Sealants", "GAL"),
    (re.compile(r"\bglazing\s+putty\b", re.I), "GLAZING PUTTY", "Paints, Coatings & Sealants", "GAL"),
    (re.compile(r"\bconcrete\b.*\b3500\s*psi\b", re.I), "CONCRETE (3500 PSI @ 7 DAYS, G1)", "Concrete & Masonry", "CUM"),
    (re.compile(r"\bconcrete\b.*\b4000\s*psi\b", re.I), "CONCRETE (4000 PSI @ 28 DAYS, G1)", "Concrete & Masonry", "CUM"),
    (re.compile(r"\bconcrete\b.*\b5000\s*psi\b", re.I), "CONCRETE (5000 PSI @ 28 DAYS, G1)", "Concrete & Masonry", "CUM"),
]


def match_dpwh_material(raw_name: str, raw_unit: str) -> DpwhDictionaryMatch | None:
    canonical_raw = _canonical_text(raw_name)
    if not canonical_raw:
        return None

    best: tuple[float, str, str, str] | None = None
    for pattern, canonical_name, category_type, unit in DPWH_MATERIAL_PATTERNS:
        if not pattern.search(raw_name) and not pattern.search(canonical_raw):
            continue
        score = SequenceMatcher(None, canonical_raw, _canonical_text(canonical_name)).ratio()
        confidence = max(0.82, min(0.96, score))
        if raw_unit and unit and _canonical_text(raw_unit) == _canonical_text(unit):
            confidence = min(0.98, confidence + 0.03)
        if best is None or confidence > best[0]:
            best = (confidence, canonical_name, category_type, unit)

    if best is None:
        return None
    confidence, canonical_name, category_type, unit = best
    return DpwhDictionaryMatch(
        canonical_name=canonical_name,
        category_type=category_type,
        unit=unit,
        confidence=round(confidence, 4),
    )
