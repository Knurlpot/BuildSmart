"""Central list of construction material categories used across the normalizer.

Keep names concise and stable because they are persisted to `Category.category_type`.
This list is intentionally broad and maps to the UI-friendly category set the user
requested.
"""

CATEGORY_TYPES = [
    "Structural",
    "Concrete & Masonry",
    "Reinforcement & Steel",
    "Timber & Lumber",
    "Roofing",
    "Insulation & Waterproofing",
    "Masonry Units & Blocks",
    "Doors, Windows & Glazing",
    "Finishing",
    "Flooring & Tiles",
    "Ceilings & Suspended Systems",
    "Paints, Coatings & Sealants",
    "Plumbing & Pipework",
    "HVAC & Mechanical",
    "Electrical & Lighting",
    "Hardware & Fasteners",
    "Adhesives & Tapes",
    "Tools, Equipment & Consumables",
    "Safety & PPE",
    "Landscaping & Siteworks",
    "Specialty Materials & Systems",
    "Others",
]
