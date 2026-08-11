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

ONTARIO_POSTSECONDARY_INSTITUTIONS = (
    "Algoma University",
    "Algonquin College",
    "Brock University",
    "Cambrian College",
    "Canadore College",
    "Carleton University",
    "Centennial College",
    "Collège Boréal",
    "Conestoga College",
    "Confederation College",
    "Durham College",
    "Fanshawe College",
    "Fleming College",
    "George Brown College",
    "Georgian College",
    "Humber College",
    "La Cité",
    "Lakehead University",
    "Laurentian University",
    "Loyalist College",
    "McMaster University",
    "Mohawk College",
    "Niagara College",
    "Nipissing University",
    "Northern College",
    "OCAD University",
    "Ontario Tech University",
    "Queen's University",
    "Sault College",
    "Seneca Polytechnic",
    "Sheridan College",
    "St. Clair College",
    "St. Lawrence College",
    "Toronto Metropolitan University",
    "Trent University",
    "University of Guelph",
    "University of Ottawa",
    "University of Toronto",
    "University of Waterloo",
    "University of Windsor",
    "Western University",
    "Wilfrid Laurier University",
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


def normalize_ontario_postsecondary_institution(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if normalized not in ONTARIO_POSTSECONDARY_INSTITUTIONS:
        return None
    return normalized
