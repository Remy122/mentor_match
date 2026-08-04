export const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function apiFetch(input, init = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.status < 500 || attempt === maxAttempts) return response;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Request failed.");
}

export function parseMentorAvailability(rawAvailability) {
  const normalized = (rawAvailability ?? "").trim();
  if (!normalized) {
    return { mentorMode: "Remote", availability: "" };
  }

  const [modeCandidate, ...rest] = normalized.split("::");
  const mode = modeCandidate?.trim();
  if (["Remote", "In person", "Hybrid"].includes(mode)) {
    return {
      mentorMode: mode,
      availability: rest.join("::").trim(),
    };
  }

  return {
    mentorMode: "Remote",
    availability: normalized,
  };
}

export function buildMentorAvailability(availability, mentorMode) {
  const cleanAvailability = (availability ?? "").trim();
  const cleanMode = ["Remote", "In person", "Hybrid"].includes(mentorMode)
    ? mentorMode
    : "Remote";
  return cleanAvailability ? `${cleanMode} :: ${cleanAvailability}` : cleanMode;
}

export function formatUniversity(university) {
  const normalized = typeof university === "string" ? university.trim() : "";
  return !normalized || normalized === "University not selected"
    ? "No affiliation"
    : normalized;
}

export function normalizeMentor(mentor) {
  const mentorProfile = Array.isArray(mentor.mentor_profiles)
    ? mentor.mentor_profiles[0]
    : mentor.mentor_profiles;
  const availabilityInfo = parseMentorAvailability(mentorProfile?.availability);

  return {
    id: mentor.id,
    name: mentor.full_name ?? "Unnamed volunteer",
    university: formatUniversity(mentor.university),
    city: availabilityInfo.mentorMode,
    availability: availabilityInfo.availability || "Not listed",
    bio: mentor.bio ?? "No bio provided yet.",
  };
}

export function parseCommaSeparated(input) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function profilePayloadFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;

  const role = metadata.role === "mentor" ? "mentor" : "mentee";
  const payload = {
    role,
    username:
      typeof metadata.username === "string" ? metadata.username : undefined,
    full_name:
      typeof metadata.full_name === "string" ? metadata.full_name : undefined,
    bio: typeof metadata.bio === "string" ? metadata.bio : undefined,
    university:
      typeof metadata.university === "string"
        ? metadata.university
        : undefined,
  };

  if (role === "mentor") {
    payload.availability =
      typeof metadata.availability === "string"
        ? metadata.availability
        : undefined;
  } else {
    payload.goals =
      typeof metadata.goals === "string" ? metadata.goals : undefined;
    payload.interests = Array.isArray(metadata.interests)
      ? metadata.interests
      : [];
  }

  return payload;
}
