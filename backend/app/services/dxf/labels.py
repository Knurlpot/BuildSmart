import re
import unicodedata

FLOOR_LABEL_RE = re.compile(
    r"\b("
    r"basement|lower\s+ground|ground|first|second|third|fourth|fifth|sixth|"
    r"\d+(?:st|nd|rd|th)?"
    r")\s+floor(?:\s+plan)?\b",
    re.IGNORECASE,
)
ROOM_DIMENSION_RE = re.compile(
    r"(?P<name>[A-Z][A-Z0-9 &./'-]{1,60}?)\s+"
    r"(?P<length>\d+(?:\.\d+)?)\s*[xX]\s*(?P<width>\d+(?:\.\d+)?)"
    r"(?:\s*(?:M|METERS?|MM))?\b",
    re.IGNORECASE,
)
DIMENSION_ONLY_RE = re.compile(
    r"^\s*(?P<length>\d+(?:\.\d+)?)\s*[xX]\s*(?P<width>\d+(?:\.\d+)?)(?:\s*(?:M|METERS?|MM))?\s*$",
    re.IGNORECASE,
)
PRINTED_AREA_RE = re.compile(
    r"\b(?:AREA\s*:\s*)?(?P<area>\d+(?:\.\d+)?)\s*(?:SQ\.?\s*M|SQM|M2|M²)\b",
    re.IGNORECASE,
)
PRINTED_AREA_RE = re.compile(
    r"\b(?:A(?:REA)?\s*[:=]\s*)?(?P<area>\d+(?:[.,]\d+)?)\s*(?:SQ\.?\s*M|SQM|M2|MÂ²|M²)",
    re.IGNORECASE,
)
ROOM_NAME_RE = re.compile(r"^[^\W\d_][\w &./'-]{1,60}$", re.IGNORECASE)

SPACE_KEYWORDS = {
    "bath",
    "bathroom",
    "bed",
    "bedroom",
    "bed/lounge",
    "beauty",
    "barber",
    "corridor",
    "dining",
    "comfort",
    "closet",
    "cr",
    "entrance",
    "escada",
    "facility",
    "facilities",
    "family",
    "foyer",
    "garage",
    "g.store",
    "hall",
    "hallway",
    "kitchen",
    "living",
    "lobby",
    "lounge",
    "quarto",
    "sala",
    "suite",
    "office",
    "parlor",
    "reception",
    "room",
    "shop",
    "shr",
    "stair",
    "stairs",
    "storage",
    "store",
    "study",
    "deposito",
    "varanda",
    "toilet",
    "void",
    "waiting",
    "wc",
}
NON_SPACE_LABELS = {
    "dn",
    "down",
    "drs",
    "duct",
    "dress",
    "drawing",
    "el",
    "elev",
    "elevator",
    "n",
    "main entrance",
    "proposal",
    "project",
    "scale",
    "slope",
    "up",
}
NORMALIZED_NAMES = {
    "bath": "Bathroom",
    "bathroom": "Bathroom",
    "closet": "Closet",
    "deposito": "Storage",
    "bed room": "Bedroom",
    "bedroom": "Bedroom",
    "corr.": "Corridor",
    "corridor": "Corridor",
    "hall": "Hallway",
    "hallway": "Hallway",
    "kitchen": "Kitchen",
    "dining room": "Dining Room",
    "dining rom": "Dining Room",
    "fam. room": "Family Room",
    "family room": "Family Room",
    "foyer": "Foyer",
    "living room": "Living Room",
    "quarto": "Bedroom",
    "sala estar jantar": "Living and Dining Room",
    "escada": "Stairs",
    "suite master": "Master Suite",
    "varanda": "Balcony",
    "lobby": "Lobby",
    "study": "Study",
    "t&b": "Bathroom",
}


def clean_text(text: str) -> str:
    cleaned = text.replace("\\P", " ").replace("\\X", " ")
    cleaned = re.sub(r"{\\[^;]+;", "", cleaned).replace("}", "")
    cleaned = re.sub(r"{?\\[A-Za-z]+", "", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def canonical_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", normalized).strip().lower()


def normalize_room_name(name: str) -> str:
    canonical = canonical_name(name)
    if canonical in NORMALIZED_NAMES:
        return NORMALIZED_NAMES[canonical]
    if canonical.startswith("suite "):
        return f"Suite {canonical.removeprefix('suite ').title()}"
    if canonical.startswith("quarto "):
        return f"Bedroom {canonical.removeprefix('quarto ').title()}"
    return re.sub(r"\s+", " ", name).strip(" -:").title()


def normalize_floor_label(text: str) -> str | None:
    match = FLOOR_LABEL_RE.search(clean_text(text))
    if not match:
        return None
    raw = match.group(0)
    words = [word.upper() if word.isdigit() else word.capitalize() for word in raw.split()]
    return " ".join(words).replace("Floor Plan", "Floor").replace("Floor", "Floor Plan", 1)


def extract_room_dimension(text: str) -> tuple[str, float, float] | None:
    if normalize_floor_label(text):
        return None
    match = ROOM_DIMENSION_RE.search(clean_text(text))
    if not match:
        return None
    name = normalize_room_name(match.group("name"))
    length = float(match.group("length"))
    width = float(match.group("width"))
    if not name or length <= 0 or width <= 0:
        return None
    return (name, length, width)


def extract_dimension_only(text: str) -> tuple[float, float] | None:
    match = DIMENSION_ONLY_RE.match(clean_text(text))
    if not match:
        return None
    length = float(match.group("length"))
    width = float(match.group("width"))
    if length <= 0 or width <= 0:
        return None
    return (length, width)


def extract_printed_area(text: str) -> float | None:
    match = PRINTED_AREA_RE.search(clean_text(text))
    if not match:
        return None
    area = float(match.group("area").replace(",", "."))
    return area if area > 0 else None


def space_label_name(text: str) -> str | None:
    cleaned = clean_text(text)
    if normalize_floor_label(cleaned):
        return None
    dimension_room = extract_room_dimension(cleaned)
    if dimension_room:
        dimension_name = dimension_room[0]
        dimension_words = set(re.split(r"[\s/&.-]+", canonical_name(dimension_name)))
        if canonical_name(dimension_name) not in SPACE_KEYWORDS and dimension_words.isdisjoint(SPACE_KEYWORDS):
            return None
        return dimension_name
    cleaned = PRINTED_AREA_RE.sub("", cleaned)
    cleaned = re.sub(
        r"\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*(?:m|meters?|mm)?|(?:wide|m|meters?|mm))\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\bA(?:REA)?\s*[:=]?\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:")
    if not cleaned:
        return None
    canonical = canonical_name(cleaned)
    if canonical in NON_SPACE_LABELS:
        return None
    words = set(re.split(r"[\s/&.-]+", canonical))
    if canonical not in SPACE_KEYWORDS and words.isdisjoint(SPACE_KEYWORDS):
        return None
    return normalize_room_name(cleaned)


def is_room_name_label(text: str) -> bool:
    cleaned = space_label_name(text)
    if not cleaned or not ROOM_NAME_RE.match(cleaned):
        return False
    return True
