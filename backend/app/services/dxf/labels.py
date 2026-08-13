import re

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
ROOM_NAME_RE = re.compile(r"^[A-Z][A-Z0-9 &./'-]{1,60}$", re.IGNORECASE)

SPACE_KEYWORDS = {
    "bath",
    "bathroom",
    "bed",
    "bedroom",
    "bed/lounge",
    "beauty",
    "barber",
    "corridor",
    "comfort",
    "cr",
    "entrance",
    "facility",
    "facilities",
    "garage",
    "g.store",
    "hall",
    "hallway",
    "kitchen",
    "living",
    "lobby",
    "lounge",
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
    "toilet",
    "void",
    "waiting",
    "wc",
}
NON_SPACE_LABELS = {
    "balcony",
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
    "proposal",
    "project",
    "scale",
    "slope",
    "up",
}
NORMALIZED_NAMES = {
    "bath": "Bathroom",
    "bathroom": "Bathroom",
    "bed room": "Bedroom",
    "bedroom": "Bedroom",
    "corr.": "Corridor",
    "corridor": "Corridor",
    "hall": "Hallway",
    "hallway": "Hallway",
    "kitchen": "Kitchen",
    "living room": "Living Room",
    "lobby": "Lobby",
    "t&b": "Bathroom",
}


def clean_text(text: str) -> str:
    cleaned = text.replace("\\P", " ").replace("\\X", " ")
    cleaned = re.sub(r"{\\[^;]+;", "", cleaned).replace("}", "")
    cleaned = re.sub(r"{?\\[A-Za-z]+", "", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def canonical_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def normalize_room_name(name: str) -> str:
    canonical = canonical_name(name)
    if canonical in NORMALIZED_NAMES:
        return NORMALIZED_NAMES[canonical]
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


def space_label_name(text: str) -> str | None:
    cleaned = clean_text(text)
    if normalize_floor_label(cleaned):
        return None
    dimension_room = extract_room_dimension(cleaned)
    if dimension_room:
        return dimension_room[0]
    cleaned = re.sub(r"\b\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?)?\s*(?:wide|m|meters?|mm)?\b", "", cleaned, flags=re.IGNORECASE)
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
