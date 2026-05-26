import re


def slugify_identifier(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]+", "_", value.strip().lower())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        normalized = "dataset"
    if normalized[0].isdigit():
        normalized = f"v_{normalized}"
    return normalized
