ONTARIO_UNIVERSITIES = (
    "Algoma University",
    "Brock University",
    "Carleton University",
    "University of Guelph",
    "Université de Hearst",
    "Lakehead University",
    "Laurentian University",
    "McMaster University",
    "Nipissing University",
    "NOSM University",
    "OCAD University",
    "Université de l'Ontario français",
    "Ontario Tech University",
    "University of Ottawa",
    "Queen's University",
    "Royal Military College of Canada",
    "University of Toronto",
    "Toronto Metropolitan University",
    "Trent University",
    "University of Waterloo",
    "Western University",
    "Wilfrid Laurier University",
    "University of Windsor",
    "York University",
)

UNIVERSITY_NOT_SELECTED = "University not selected"


def normalize_ontario_university(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if normalized not in ONTARIO_UNIVERSITIES:
        return None
    return normalized
