"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  BACKEND_BASE_URL,
  buildMentorAvailability,
  formatUniversity,
  normalizeMentor,
  parseCommaSeparated,
  parseMentorAvailability,
  profilePayloadFromMetadata,
} from "../lib/portalUtils";
import {
  ONTARIO_POSTSECONDARY_INSTITUTIONS,
  ONTARIO_UNIVERSITIES,
} from "../lib/ontarioUniversities";
import { supabase, hasSupabaseEnv } from "../lib/supabaseClient";

const EMPTY_ADMIN_INVITE_FORM = {
  email: "",
  role: "mentor",
  university: "",
};

const EMPTY_ADMIN_PROFILE_FORM = {
  email: "",
  password: "",
  role: "mentor",
  username: "",
  fullName: "",
  university: "",
  bio: "",
  approvalStatus: "approved",
  isVisible: false,
  sameUniversityOnly: true,
  mentorMode: "Remote",
  availability: "",
  goals: "",
  interests: "",
};

const EMPTY_PROGRAM_APPLICATION = {
  fullLegalName: "",
  preferredName: "",
  email: "",
  phoneNumber: "",
  dateOfBirth: "",
  university: "",
  caregivingSituation: "",
  supportRequested: "",
  communicationPreference: "",
  accessibilityNeeds: "",
  additionalInformation: "",
  volunteerMotivation: "",
  caregivingExperience: "",
  otherRelevantExperience: "",
  schoolProgramInterest: "",
  consentAcknowledged: false,
};

const ERROR_MESSAGES = {
  load: "We couldn't load this information. Please try again.",
  profile: "We couldn't load your account. Please try again.",
  save: "We couldn't save your changes. Please try again.",
  action: "We couldn't complete that action. Please try again.",
  auth: "We couldn't complete your request. Please check your details and try again.",
};

function HeartMark({ inverted = false }) {
  return (
    <span
      aria-hidden="true"
      className={`brand-heart ${inverted ? "brand-heart-light" : ""}`}
    >
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M20.8 5.9c-1.7-1.8-4.6-1.8-6.4 0L12 8.3 9.6 5.9a4.5 4.5 0 0 0-6.4 6.3l2.4 2.4L12 21l6.4-6.4 2.4-2.4a4.5 4.5 0 0 0 0-6.3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function LineIcon({ name }) {
  const paths = {
    apply: (
      <>
        <path d="m4 17 9.8-9.8 3 3L7 20H4v-3Z" />
        <path d="m12.8 8.2 2-2a2.1 2.1 0 0 1 3 3l-2 2M12 20h8" />
      </>
    ),
    review: (
      <>
        <rect x="5" y="5" width="14" height="16" rx="2" />
        <path d="M9 5V3h6v2M9 11h6M9 15h4" />
      </>
    ),
    connect: (
      <>
        <path d="m7.5 13.5 2.2 2.2 6.8-7" />
        <path d="M19 12.5a7 7 0 1 1-3.4-6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 19 6v5c0 4.6-2.8 8.2-7 10-4.2-1.8-7-5.4-7-10V6l7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    campus: (
      <>
        <path d="m3 9 9-5 9 5-9 5-9-5Z" />
        <path d="M7 12v5c3.2 2 6.8 2 10 0v-5M21 9v6" />
      </>
    ),
    community: (
      <>
        <path d="M8 13 5.8 11a2.3 2.3 0 0 1 3.1-3.4L12 10.5l3.1-2.9a2.3 2.3 0 0 1 3.1 3.4L12 17l-2-1.8" />
        <path d="m4 15 4 4 2-2M2 13l2-2" />
      </>
    ),
  };

  return (
    <span className="line-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </svg>
    </span>
  );
}

function AdminProgramApplicationCard({
  application,
  isReviewing,
  onReview,
  reviewed = false,
}) {
  const isVolunteer = application.application_type === "volunteer";
  const submittedDate = application.created_at
    ? new Date(application.created_at).toLocaleDateString()
    : "Unknown";
  const dateOfBirth = application.date_of_birth
    ? new Date(`${application.date_of_birth}T00:00:00`).toLocaleDateString()
    : "Not provided";

  const responseFields = isVolunteer
    ? [
        ["Why they want to volunteer", application.volunteer_motivation],
        ["Young caregiver experience", application.caregiving_experience],
        ["Other relevant experience", application.other_relevant_experience],
        ["Interest in starting a school program", application.school_program_interest],
      ]
    : [
        ["Caregiving situation", application.caregiving_situation],
        ["Support requested", application.support_requested],
        ["Communication preference", application.communication_preference],
        ["Accessibility needs", application.accessibility_needs],
        ["Additional information", application.additional_information],
      ];

  return (
    <article
      className="admin-application-card"
      data-testid={`program-application-${application.id}`}
    >
      <div className="admin-application-heading">
        <div>
          <div className="admin-application-badges">
            <span>{isVolunteer ? "Volunteer" : "Caregiver"}</span>
            <span className={`request-status request-status-${application.status}`}>
              {application.status}
            </span>
          </div>
          <h5>{application.preferred_name || application.full_legal_name}</h5>
          <p>
            Submitted {submittedDate} · Legal name: {application.full_legal_name}
          </p>
        </div>
        {!reviewed && (
          <div className="admin-application-actions">
            <button
              type="button"
              onClick={() => onReview(application.id, "approve")}
              disabled={isReviewing}
              className="admin-application-approve"
            >
              Approve application
            </button>
            <button
              type="button"
              onClick={() => onReview(application.id, "reject")}
              disabled={isReviewing}
              className="admin-application-reject"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      <section className="admin-application-private">
        <div>
          <p>Private screening information</p>
          <span>Visible to QYCC administrators only</span>
        </div>
        <dl>
          <div>
            <dt>Email</dt>
            <dd>{application.email}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{application.phone_number}</dd>
          </div>
          <div>
            <dt>Date of birth</dt>
            <dd>{dateOfBirth}</dd>
          </div>
          <div>
            <dt>School</dt>
            <dd>{application.university || "Not affiliated"}</dd>
          </div>
        </dl>
      </section>

      <section className="admin-application-responses">
        <h6>Application responses</h6>
        <dl>
          {responseFields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "Not provided"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="admin-application-consent">
        <span aria-hidden="true">✓</span>
        Privacy and information-sharing consent acknowledged
        {reviewed && application.reviewed_at && (
          <small>
            Reviewed {new Date(application.reviewed_at).toLocaleDateString()}
          </small>
        )}
      </div>
    </article>
  );
}

export default function Home() {
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isAuthPortalOpen, setIsAuthPortalOpen] = useState(false);
  const [isAboutPage, setIsAboutPage] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [signupRole, setSignupRole] = useState("mentee");
  const [isSignupRoleLocked, setIsSignupRoleLocked] = useState(false);
  const [signupUsername, setSignupUsername] = useState("");
  const [signupFullName, setSignupFullName] = useState("");
  const [signupUniversity, setSignupUniversity] = useState("");
  const [signupBio, setSignupBio] = useState("");
  const [signupMentorMode, setSignupMentorMode] = useState("Remote");
  const [signupAvailability, setSignupAvailability] = useState("");
  const [signupGoals, setSignupGoals] = useState("");
  const [signupInterests, setSignupInterests] = useState("");
  const [programApplication, setProgramApplication] = useState(
    EMPTY_PROGRAM_APPLICATION,
  );
  const [isApplicationSubmitting, setIsApplicationSubmitting] =
    useState(false);
  const [volunteers, setVolunteers] = useState([]);
  const [isLoadingVolunteers, setIsLoadingVolunteers] = useState(false);
  const [volunteerLoadError, setVolunteerLoadError] = useState("");
  const [selectedVolunteerId, setSelectedVolunteerId] = useState("");
  const [isMatchSent, setIsMatchSent] = useState(false);
  const [isSendingMatch, setIsSendingMatch] = useState(false);
  const [careType, setCareType] = useState("");
  const [requestError, setRequestError] = useState("");
  const [menteeRequests, setMenteeRequests] = useState([]);
  const [isLoadingMenteeRequests, setIsLoadingMenteeRequests] = useState(false);
  const [menteeRequestsError, setMenteeRequestsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [universityFilter, setUniversityFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [includeOtherUniversities, setIncludeOtherUniversities] =
    useState(false);
  const [didAutoExpandUniversitySearch, setDidAutoExpandUniversitySearch] =
    useState(false);
  const [profileData, setProfileData] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const [profileForm, setProfileForm] = useState({
    role: "mentee",
    username: "",
    fullName: "",
    university: "",
    bio: "",
    isVisible: false,
    sameUniversityOnly: true,
    mentorMode: "Remote",
    availability: "",
    goals: "",
    interests: "",
  });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [adminPendingUsers, setAdminPendingUsers] = useState([]);
  const [adminReviewedUsers, setAdminReviewedUsers] = useState([]);
  const [adminProgramApplications, setAdminProgramApplications] = useState([]);
  const [adminReviewedProgramApplications, setAdminReviewedProgramApplications] =
    useState([]);
  const [adminMetrics, setAdminMetrics] = useState(null);
  const [adminMentors, setAdminMentors] = useState([]);
  const [adminMatches, setAdminMatches] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminPreapprovedEmails, setAdminPreapprovedEmails] = useState([]);
  const [adminInviteForm, setAdminInviteForm] = useState(
    EMPTY_ADMIN_INVITE_FORM,
  );
  const [adminProfileForm, setAdminProfileForm] = useState(
    EMPTY_ADMIN_PROFILE_FORM,
  );
  const [adminEditingUserId, setAdminEditingUserId] = useState("");
  const [isAdminInviteSaving, setIsAdminInviteSaving] = useState(false);
  const [isAdminProfileSaving, setIsAdminProfileSaving] = useState(false);
  const [adminMatchStatusFilter, setAdminMatchStatusFilter] = useState("all");
  const [adminSessionEntries, setAdminSessionEntries] = useState([]);
  const [adminSessionsTotal, setAdminSessionsTotal] = useState(0);
  const [adminSessionMentorFilter, setAdminSessionMentorFilter] =
    useState("all");
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminSuccess, setAdminSuccess] = useState("");
  const [adminActionUserId, setAdminActionUserId] = useState("");
  const [adminViewMode, setAdminViewMode] = useState("admin");
  const [adminSelectedReviewedUser, setAdminSelectedReviewedUser] =
    useState(null);
  const [adminSelectedMentor, setAdminSelectedMentor] = useState(null);
  const [adminSelectedMentorRequests, setAdminSelectedMentorRequests] =
    useState([]);
  const [isLoadingAdminMentorDetails, setIsLoadingAdminMentorDetails] =
    useState(false);
  const [adminMentorDetailsError, setAdminMentorDetailsError] = useState("");
  const [mentorViewMode, setMentorViewMode] = useState("requests");
  const [mentorRequests, setMentorRequests] = useState([]);
  const [isLoadingMentorRequests, setIsLoadingMentorRequests] = useState(false);
  const [mentorRequestsError, setMentorRequestsError] = useState("");
  const [mentorDecisionLoadingId, setMentorDecisionLoadingId] = useState(null);
  const [mentorDecisionError, setMentorDecisionError] = useState("");
  const [mentorDecisionSuccess, setMentorDecisionSuccess] = useState("");
  const [mentorHoursForm, setMentorHoursForm] = useState({
    matchId: "",
    meetingDate: "",
    hours: "",
    nextMeeting: "",
    topicsDiscussed: "",
    anythingToFlag: "",
  });
  const [isMentorHoursLoading, setIsMentorHoursLoading] = useState(false);
  const [isMentorHoursSaving, setIsMentorHoursSaving] = useState(false);
  const [mentorHoursError, setMentorHoursError] = useState("");
  const [mentorHoursSuccess, setMentorHoursSuccess] = useState("");
  const [mentorHoursEntries, setMentorHoursEntries] = useState([]);
  const [mentorHoursTotal, setMentorHoursTotal] = useState(0);

  const availabilityOptions = useMemo(
    () =>
      [
        ...new Set(volunteers.map((volunteer) => volunteer.availability)),
      ].sort(),
    [volunteers],
  );

  const universityOptions = useMemo(
    () =>
      [...new Set(volunteers.map((volunteer) => volunteer.university))]
        .filter(Boolean)
        .sort(),
    [volunteers],
  );

  const filteredVolunteers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return volunteers.filter((volunteer) => {
      const matchesUniversity =
        universityFilter === "all" ||
        volunteer.university === universityFilter;
      const matchesAvailability =
        availabilityFilter === "all" ||
        volunteer.availability === availabilityFilter;
      if (!normalizedSearch) {
        return matchesUniversity && matchesAvailability;
      }

      const searchableText = [
        volunteer.name,
        volunteer.city,
        volunteer.bio,
        volunteer.university,
        volunteer.availability,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchableText.includes(normalizedSearch);

      return (
        matchesUniversity &&
        matchesAvailability && matchesSearch
      );
    });
  }, [
    availabilityFilter,
    searchQuery,
    universityFilter,
    volunteers,
  ]);

  const selectedVolunteer = useMemo(
    () => volunteers.find((volunteer) => volunteer.id === selectedVolunteerId),
    [selectedVolunteerId, volunteers],
  );
  const userRole = profileData?.profile?.role;
  const approvalStatus = profileData?.profile?.approval_status;
  const isAdmin = userRole === "admin";
  const isMentee = userRole === "mentee";
  const isMentor = userRole === "mentor";
  const isApproved = approvalStatus === "approved";
  const isApprovedMentee = isMentee && isApproved;
  const isApprovedMentor = isMentor && isApproved;
  const isSuperAdmin = Boolean(profileData?.profile?.is_super_admin);
  const hasAdminUniversityScope = Boolean(
    isSuperAdmin ||
      (profileData?.profile?.university &&
        profileData.profile.university !== "University not selected"),
  );
  const isAwaitingApproval =
    (isMentee || isMentor) && approvalStatus !== "approved";
  const showAdminDashboard = isAdmin && adminViewMode === "admin";
  const showMenteeExperience =
    isApprovedMentee || (isAdmin && adminViewMode === "mentee");
  const showMentorRequests = isApprovedMentor && mentorViewMode === "requests";
  const showMentorMentees = isApprovedMentor && mentorViewMode === "mentees";
  const activeMenteeConnections = useMemo(
    () => mentorRequests.filter((request) => request.status === "active"),
    [mentorRequests],
  );
  const adminSessionMentorOptions = useMemo(
    () =>
      [
        ...new Set(
          adminSessionEntries.map(
            (entry) => entry.mentor_profile?.full_name || "Unknown volunteer",
          ),
        ),
      ].sort(),
    [adminSessionEntries],
  );
  const filteredAdminSessionEntries = useMemo(() => {
    if (adminSessionMentorFilter === "all") {
      return adminSessionEntries;
    }
    return adminSessionEntries.filter(
      (entry) =>
        (entry.mentor_profile?.full_name || "Unknown volunteer") ===
        adminSessionMentorFilter,
    );
  }, [adminSessionMentorFilter, adminSessionEntries]);
  const filteredAdminMatches = useMemo(() => {
    if (adminMatchStatusFilter === "all") return adminMatches;
    return adminMatches.filter(
      (match) => match.status === adminMatchStatusFilter,
    );
  }, [adminMatchStatusFilter, adminMatches]);
  const adminEditingUser = useMemo(
    () => adminUsers.find((user) => user.id === adminEditingUserId) ?? null,
    [adminEditingUserId, adminUsers],
  );
  const userInitial = useMemo(
    () =>
      (
        profileForm.fullName?.trim().charAt(0) ||
        emailInput?.trim().charAt(0) ||
        "U"
      ).toUpperCase(),
    [emailInput, profileForm.fullName],
  );

  useEffect(() => {
    if (activeMenteeConnections.length === 0) {
      setMentorHoursForm((current) => ({ ...current, matchId: "" }));
      return;
    }

    const hasCurrentSelection = activeMenteeConnections.some(
      (request) => String(request.id) === String(mentorHoursForm.matchId),
    );
    if (!hasCurrentSelection) {
      setMentorHoursForm((current) => ({
        ...current,
        matchId: String(activeMenteeConnections[0].id),
      }));
    }
  }, [activeMenteeConnections, mentorHoursForm.matchId]);

  useEffect(() => {
    if (!hasSupabaseEnv || !supabase) return;

    async function hydrateAuthFromSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          await supabase.auth.signOut({ scope: "local" });
          window.localStorage.removeItem("ocgoAccessToken");
          setIsUnlocked(false);
          return;
        }

        if (session?.access_token) {
          window.localStorage.setItem("ocgoAccessToken", session.access_token);
          setIsAuthPortalOpen(true);
          setIsUnlocked(true);
        }
      } catch {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        window.localStorage.removeItem("ocgoAccessToken");
        setIsUnlocked(false);
      }
    }

    hydrateAuthFromSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        window.localStorage.setItem("ocgoAccessToken", session.access_token);
        setIsAuthPortalOpen(true);
        setIsUnlocked(true);
      } else {
        window.localStorage.removeItem("ocgoAccessToken");
        setIsUnlocked(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;

    async function loadProfile() {
      const token = window.localStorage.getItem("ocgoAccessToken");
      if (!token) return;

      setIsProfileLoading(true);
      setProfileError("");
      setProfileSaveMessage("");

      try {
        let response = await apiFetch(`${BACKEND_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 404) {
          await apiFetch(`${BACKEND_BASE_URL}/api/auth/sync-profile`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          });

          response = await apiFetch(`${BACKEND_BASE_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        }

        if (!response.ok) {
          throw new Error();
        }

        let data = await response.json();
        const profileRole = data.profile?.role;
        const isRoleProfileMissing =
          (profileRole === "mentor" && !data.mentor_profile) ||
          (profileRole === "mentee" && !data.mentee_profile);

        if (isRoleProfileMissing) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const metadataPayload = profilePayloadFromMetadata(
            user?.user_metadata,
          );

          if (metadataPayload?.role === profileRole) {
            const syncResponse = await apiFetch(
              `${BACKEND_BASE_URL}/api/auth/sync-profile`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(metadataPayload),
              },
            );

            if (syncResponse.ok) {
              data = await syncResponse.json();
            }
          }
        }

        const profile = data.profile ?? {};
        const mentorProfile = data.mentor_profile ?? {};
        const menteeProfile = data.mentee_profile ?? {};
        const mentorAvailabilityInfo = parseMentorAvailability(
          mentorProfile.availability,
        );

        setProfileData(data);
        setProfileForm({
          role: profile.role ?? "mentee",
          username: profile.username ?? "",
          fullName: profile.full_name ?? "",
          university:
            profile.university === "University not selected"
              ? ""
              : profile.university ?? "",
          bio: profile.bio ?? "",
          isVisible: Boolean(profile.is_visible),
          sameUniversityOnly: profile.same_university_only !== false,
          mentorMode: mentorAvailabilityInfo.mentorMode,
          availability: mentorAvailabilityInfo.availability,
          goals: menteeProfile.goals ?? "",
          interests: (menteeProfile.interests ?? []).join(", "),
        });
      } catch (_error) {
        setProfileError(ERROR_MESSAGES.profile);
      } finally {
        setIsProfileLoading(false);
      }
    }

    loadProfile();
  }, [isUnlocked]);

  useEffect(() => {
    if (!isApprovedMentee) return;
    setIncludeOtherUniversities(false);
    setDidAutoExpandUniversitySearch(false);
    setUniversityFilter("all");
    setSelectedVolunteerId("");
  }, [isApprovedMentee, profileData?.profile?.university]);

  useEffect(() => {
    if (!isUnlocked || !showMenteeExperience) {
      setVolunteers([]);
      setIsLoadingVolunteers(false);
      setVolunteerLoadError("");
      return;
    }

    async function loadVolunteers() {
      const token = window.localStorage.getItem("ocgoAccessToken");

      if (!token) {
        setVolunteers([]);
        setVolunteerLoadError("Your session ended. Please sign in again.");
        return;
      }

      setIsLoadingVolunteers(true);
      setVolunteerLoadError("");

      try {
        const query = new URLSearchParams({
          include_other_universities: String(includeOtherUniversities),
        });
        const response = await apiFetch(
          `${BACKEND_BASE_URL}/api/matches/mentors/available?${query}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error();
        }

        const data = await response.json();
        const normalized = (data.mentors ?? []).map(normalizeMentor);
        if (
          isApprovedMentee &&
          !includeOtherUniversities &&
          normalized.length === 0
        ) {
          setVolunteers([]);
          setDidAutoExpandUniversitySearch(true);
          setIncludeOtherUniversities(true);
          return;
        }
        setVolunteers(normalized);
      } catch (_error) {
        setVolunteers([]);
        setVolunteerLoadError(ERROR_MESSAGES.load);
      } finally {
        setIsLoadingVolunteers(false);
      }
    }

    loadVolunteers();
  }, [
    includeOtherUniversities,
    isUnlocked,
    isApprovedMentee,
    profileData?.profile?.university,
    showMenteeExperience,
  ]);

  async function handleSaveProfile() {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setProfileError("Your session ended. Please sign in again.");
      return;
    }

    const role = profileData?.profile?.role ?? profileForm.role;
    const payload = {
      username: profileForm.username.trim(),
      full_name: profileForm.fullName.trim(),
      university: profileForm.university,
      bio: profileForm.bio.trim(),
      is_visible: profileForm.isVisible,
      same_university_only: profileForm.sameUniversityOnly,
      availability: buildMentorAvailability(
        profileForm.availability,
        profileForm.mentorMode,
      ),
      goals: profileForm.goals.trim(),
      interests: parseCommaSeparated(profileForm.interests),
    };
    if (!payload.username) {
      delete payload.username;
    }
    if (!payload.university && role !== "admin") {
      setProfileError("Select your Ontario university.");
      return;
    }
    if (role === "admin") {
      delete payload.university;
    }

    if (role !== "mentor") {
      delete payload.availability;
      delete payload.is_visible;
      delete payload.same_university_only;
    }
    if (role !== "mentee") {
      delete payload.goals;
      delete payload.interests;
    }

    setIsProfileSaving(true);
    setProfileError("");
    setProfileSaveMessage("");

    try {
      const response = await apiFetch(`${BACKEND_BASE_URL}/api/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error();
      }

      const updated = await response.json();
      const updatedProfile = updated.profile ?? {};
      const updatedMentor = updated.mentor_profile ?? {};
      const updatedMentee = updated.mentee_profile ?? {};
      const updatedMentorAvailabilityInfo = parseMentorAvailability(
        updatedMentor.availability,
      );
      setProfileData(updated);
      setProfileForm({
        role: updatedProfile.role ?? "mentee",
        username: updatedProfile.username ?? "",
        fullName: updatedProfile.full_name ?? "",
        university:
          updatedProfile.university === "University not selected"
            ? ""
            : updatedProfile.university ?? "",
        bio: updatedProfile.bio ?? "",
        isVisible: Boolean(updatedProfile.is_visible),
        sameUniversityOnly: updatedProfile.same_university_only !== false,
        mentorMode: updatedMentorAvailabilityInfo.mentorMode,
        availability: updatedMentorAvailabilityInfo.availability,
        goals: updatedMentee.goals ?? "",
        interests: (updatedMentee.interests ?? []).join(", "),
      });
      setProfileSaveMessage("Profile saved.");
    } catch (_error) {
      setProfileError(ERROR_MESSAGES.save);
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function loadAdminDashboardData() {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) return;

    setIsAdminLoading(true);
    setAdminError("");

    try {
      const [
        pendingResponse,
        reviewedResponse,
        programApplicationsResponse,
        reviewedProgramApplicationsResponse,
        metricsResponse,
        mentorsResponse,
        sessionsResponse,
        matchesResponse,
        usersResponse,
        preapprovedEmailsResponse,
      ] =
        await Promise.all([
          apiFetch(`${BACKEND_BASE_URL}/api/admin/pending-users`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          apiFetch(`${BACKEND_BASE_URL}/api/admin/reviewed-users`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          apiFetch(
            `${BACKEND_BASE_URL}/api/admin/program-applications?review_state=pending`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          ),
          apiFetch(
            `${BACKEND_BASE_URL}/api/admin/program-applications?review_state=reviewed`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          ),
          apiFetch(`${BACKEND_BASE_URL}/api/admin/dashboard`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          apiFetch(`${BACKEND_BASE_URL}/api/admin/mentors`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          apiFetch(`${BACKEND_BASE_URL}/api/volunteer-hours`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          apiFetch(`${BACKEND_BASE_URL}/api/admin/matches`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          apiFetch(`${BACKEND_BASE_URL}/api/admin/users`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          apiFetch(`${BACKEND_BASE_URL}/api/admin/preapproved-emails`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

      if (
        [
          pendingResponse,
          reviewedResponse,
          programApplicationsResponse,
          reviewedProgramApplicationsResponse,
          metricsResponse,
          mentorsResponse,
          sessionsResponse,
          matchesResponse,
          usersResponse,
          preapprovedEmailsResponse,
        ].some((response) => !response.ok)
      ) {
        throw new Error();
      }

      const pendingData = await pendingResponse.json();
      const reviewedData = await reviewedResponse.json();
      const programApplicationsData = await programApplicationsResponse.json();
      const reviewedProgramApplicationsData =
        await reviewedProgramApplicationsResponse.json();
      const metricsData = await metricsResponse.json();
      const mentorsData = await mentorsResponse.json();
      const sessionsData = await sessionsResponse.json();
      const matchesData = await matchesResponse.json();
      const usersData = await usersResponse.json();
      const preapprovedEmailsData = await preapprovedEmailsResponse.json();

      setAdminPendingUsers(pendingData.pending_users ?? []);
      setAdminReviewedUsers(reviewedData.reviewed_users ?? []);
      setAdminProgramApplications(programApplicationsData.applications ?? []);
      setAdminReviewedProgramApplications(
        reviewedProgramApplicationsData.applications ?? [],
      );
      setAdminMetrics(metricsData);
      setAdminMentors(mentorsData.mentors ?? []);
      setAdminSessionEntries(sessionsData.entries ?? []);
      setAdminSessionsTotal(sessionsData.total_hours ?? 0);
      setAdminMatches(matchesData.matches ?? []);
      setAdminUsers(usersData.users ?? []);
      setAdminPreapprovedEmails(
        preapprovedEmailsData.preapproved_emails ?? [],
      );
      setAdminSelectedReviewedUser((current) => {
        if (!current) return null;
        return (
          (reviewedData.reviewed_users ?? []).find(
            (user) => user.id === current.id,
          ) ?? null
        );
      });
    } catch (_error) {
      setAdminError(ERROR_MESSAGES.load);
    } finally {
      setIsAdminLoading(false);
    }
  }

  async function loadAdminMentorDetails(mentorId) {
    if (adminSelectedMentor?.id === mentorId) {
      setAdminSelectedMentor(null);
      setAdminSelectedMentorRequests([]);
      setAdminMentorDetailsError("");
      setIsLoadingAdminMentorDetails(false);
      return;
    }

    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) return;

    setIsLoadingAdminMentorDetails(true);
    setAdminMentorDetailsError("");

    try {
      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/matches/mentor-requests/${mentorId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error();
      }

      const data = await response.json();
      setAdminSelectedMentor(data.mentor ?? null);
      setAdminSelectedMentorRequests(data.requests ?? []);
    } catch (_error) {
      setAdminSelectedMentor(null);
      setAdminSelectedMentorRequests([]);
      setAdminMentorDetailsError(ERROR_MESSAGES.load);
    } finally {
      setIsLoadingAdminMentorDetails(false);
    }
  }

  useEffect(() => {
    if (!isUnlocked || !isAdmin) {
      setAdminPendingUsers([]);
      setAdminReviewedUsers([]);
      setAdminProgramApplications([]);
      setAdminReviewedProgramApplications([]);
      setAdminMetrics(null);
      setAdminMentors([]);
      setAdminMatches([]);
      setAdminUsers([]);
      setAdminPreapprovedEmails([]);
      setAdminInviteForm(EMPTY_ADMIN_INVITE_FORM);
      setAdminProfileForm(EMPTY_ADMIN_PROFILE_FORM);
      setAdminEditingUserId("");
      setIsAdminInviteSaving(false);
      setIsAdminProfileSaving(false);
      setAdminMatchStatusFilter("all");
      setAdminSessionEntries([]);
      setAdminSessionsTotal(0);
      setAdminSessionMentorFilter("all");
      setAdminError("");
      setAdminSuccess("");
      setAdminActionUserId("");
      setAdminSelectedReviewedUser(null);
      setAdminSelectedMentor(null);
      setAdminSelectedMentorRequests([]);
      setIsLoadingAdminMentorDetails(false);
      setAdminMentorDetailsError("");
      setIsAdminLoading(false);
      return;
    }

    if (!hasAdminUniversityScope) {
      setAdminError("");
      setIsAdminLoading(false);
      return;
    }

    loadAdminDashboardData();
  }, [hasAdminUniversityScope, isAdmin, isUnlocked]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminViewMode("admin");
    }
  }, [isAdmin]);

  useEffect(() => {
    const adminUniversity = profileData?.profile?.university;
    if (!isAdmin || isSuperAdmin || !adminUniversity) return;

    setAdminInviteForm((current) => ({
      ...current,
      university: adminUniversity,
    }));
    setAdminProfileForm((current) => ({
      ...current,
      university: adminUniversity,
    }));
  }, [isAdmin, isSuperAdmin, profileData?.profile?.university]);

  async function loadMenteeRequestsData() {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) return;

    setIsLoadingMenteeRequests(true);
    setMenteeRequestsError("");

    try {
      const response = await apiFetch(`${BACKEND_BASE_URL}/api/matches/my-requests`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error();
      }

      const data = await response.json();
      setMenteeRequests(data.requests ?? []);
    } catch (_error) {
      setMenteeRequests([]);
      setMenteeRequestsError(ERROR_MESSAGES.load);
    } finally {
      setIsLoadingMenteeRequests(false);
    }
  }

  useEffect(() => {
    if (!isUnlocked || !isApprovedMentee) {
      setMenteeRequests([]);
      setMenteeRequestsError("");
      setIsLoadingMenteeRequests(false);
      return;
    }

    loadMenteeRequestsData();
  }, [isApprovedMentee, isUnlocked]);

  async function loadMentorRequestsData() {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) return;

    setIsLoadingMentorRequests(true);
    setMentorRequestsError("");

    try {
      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/matches/mentor-requests`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error();
      }

      const data = await response.json();
      setMentorRequests(data.requests ?? []);
    } catch (_error) {
      setMentorRequests([]);
      setMentorRequestsError(ERROR_MESSAGES.load);
    } finally {
      setIsLoadingMentorRequests(false);
    }
  }

  async function loadMentorHoursData() {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) return;

    setIsMentorHoursLoading(true);
    setMentorHoursError("");

    try {
      const response = await apiFetch(`${BACKEND_BASE_URL}/api/volunteer-hours`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error();
      }

      const data = await response.json();
      setMentorHoursEntries(data.entries ?? []);
      setMentorHoursTotal(data.total_hours ?? 0);
    } catch (_error) {
      setMentorHoursEntries([]);
      setMentorHoursTotal(0);
      setMentorHoursError(ERROR_MESSAGES.load);
    } finally {
      setIsMentorHoursLoading(false);
    }
  }

  async function handleMentorDecision(matchId, decision) {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setMentorDecisionError("Your session ended. Please sign in again.");
      return;
    }

    setMentorDecisionLoadingId(matchId);
    setMentorDecisionError("");
    setMentorDecisionSuccess("");

    try {
      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/matches/${matchId}/mentor-decision`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            decision,
          }),
        },
      );

      if (!response.ok) {
        throw new Error();
      }

      setMentorDecisionSuccess(
        decision === "accept"
          ? "Caregiver request accepted."
          : "Caregiver request declined.",
      );
      await loadMentorRequestsData();
    } catch (_error) {
      setMentorDecisionError(ERROR_MESSAGES.action);
    } finally {
      setMentorDecisionLoadingId(null);
    }
  }

  async function handleLogMentorHours(event) {
    event.preventDefault();

    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setMentorHoursError("Your session ended. Please sign in again.");
      return;
    }
    if (
      !mentorHoursForm.matchId ||
      !mentorHoursForm.meetingDate ||
      !mentorHoursForm.hours ||
      !mentorHoursForm.topicsDiscussed.trim()
    ) {
      setMentorHoursError(
        "Please choose a caregiver match, date, hours, and topics discussed.",
      );
      return;
    }

    setIsMentorHoursSaving(true);
    setMentorHoursError("");
    setMentorHoursSuccess("");

    try {
      const response = await apiFetch(`${BACKEND_BASE_URL}/api/volunteer-hours`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          match_id: Number(mentorHoursForm.matchId),
          meeting_date: mentorHoursForm.meetingDate,
          hours: Number(mentorHoursForm.hours),
          next_meeting: mentorHoursForm.nextMeeting || null,
          topics_discussed: mentorHoursForm.topicsDiscussed.trim(),
          anything_to_flag: mentorHoursForm.anythingToFlag.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error();
      }

      setMentorHoursSuccess("Volunteer hours logged.");
      setMentorHoursForm((current) => ({
        ...current,
        meetingDate: "",
        hours: "",
        nextMeeting: "",
        topicsDiscussed: "",
        anythingToFlag: "",
      }));
      await loadMentorHoursData();
    } catch (_error) {
      setMentorHoursError(ERROR_MESSAGES.action);
    } finally {
      setIsMentorHoursSaving(false);
    }
  }

  useEffect(() => {
    if (!isApprovedMentor) {
      setMentorViewMode("requests");
      setMentorRequests([]);
      setMentorRequestsError("");
      setIsLoadingMentorRequests(false);
      setMentorDecisionLoadingId(null);
      setMentorDecisionError("");
      setMentorDecisionSuccess("");
      setMentorHoursForm({
        matchId: "",
        meetingDate: "",
        hours: "",
        nextMeeting: "",
        topicsDiscussed: "",
        anythingToFlag: "",
      });
      setIsMentorHoursLoading(false);
      setIsMentorHoursSaving(false);
      setMentorHoursError("");
      setMentorHoursSuccess("");
      setMentorHoursEntries([]);
      setMentorHoursTotal(0);
      return;
    }

    if (mentorViewMode !== "requests" && mentorViewMode !== "mentees") {
      return;
    }

    if (mentorViewMode === "requests") {
      loadMentorRequestsData();
      return;
    }

    loadMentorRequestsData();
    loadMentorHoursData();
  }, [isApprovedMentor, mentorViewMode]);

  async function handleAdminRequestAction(userId, action) {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setAdminError("Your session ended. Please sign in again.");
      return;
    }

    setAdminActionUserId(userId);
    setAdminError("");
    setAdminSuccess("");

    try {
      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/admin/users/${userId}/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error();
      }

      setAdminSuccess(
        action === "approve"
          ? "Request approved successfully."
          : "Request rejected successfully.",
      );
      await loadAdminDashboardData();
    } catch (_error) {
      setAdminError(ERROR_MESSAGES.action);
    } finally {
      setAdminActionUserId("");
    }
  }

  async function handleProgramApplicationAction(applicationId, action) {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setAdminError("Your session ended. Please sign in again.");
      return;
    }

    setAdminActionUserId(applicationId);
    setAdminError("");
    setAdminSuccess("");

    try {
      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/admin/program-applications/${applicationId}/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error();
      }

      setAdminSuccess(
        action === "approve"
          ? "Application approved. Create or invite the member account when ready."
          : "Application rejected.",
      );
      await loadAdminDashboardData();
    } catch (_error) {
      setAdminError(ERROR_MESSAGES.action);
    } finally {
      setAdminActionUserId("");
    }
  }

  async function handleRemoveMentorAccess(mentorId) {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setAdminError("Your session ended. Please sign in again.");
      return;
    }

    setAdminActionUserId(mentorId);
    setAdminError("");
    setAdminSuccess("");
    setAdminMentorDetailsError("");

    try {
      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/admin/mentors/${mentorId}/remove-access`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error();
      }

      setAdminSuccess("Volunteer listing and access removed.");
      setAdminSelectedMentor(null);
      setAdminSelectedMentorRequests([]);
      await loadAdminDashboardData();
    } catch (_error) {
      setAdminError(ERROR_MESSAGES.action);
    } finally {
      setAdminActionUserId("");
    }
  }

  function resetAdminProfileForm() {
    setAdminEditingUserId("");
    setAdminProfileForm({
      ...EMPTY_ADMIN_PROFILE_FORM,
      university: isSuperAdmin
        ? ""
        : profileData?.profile?.university || "",
    });
  }

  async function handleCreatePreapprovedEmail(event) {
    event.preventDefault();
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) return;

    setIsAdminInviteSaving(true);
    setAdminError("");
    setAdminSuccess("");
    try {
      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/admin/preapproved-emails`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(adminInviteForm),
        },
      );
      if (!response.ok) {
        throw new Error();
      }

      setAdminSuccess("Email preapproved. That signup will be approved automatically.");
      setAdminInviteForm({
        ...EMPTY_ADMIN_INVITE_FORM,
        university: isSuperAdmin
          ? ""
          : profileData?.profile?.university || "",
      });
      await loadAdminDashboardData();
    } catch (_error) {
      setAdminError(ERROR_MESSAGES.action);
    } finally {
      setIsAdminInviteSaving(false);
    }
  }

  async function handleDeletePreapprovedEmail(entryId) {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) return;

    setAdminError("");
    setAdminSuccess("");
    try {
      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/admin/preapproved-emails/${entryId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        throw new Error();
      }
      setAdminSuccess("Preapproved email removed.");
      await loadAdminDashboardData();
    } catch (_error) {
      setAdminError(ERROR_MESSAGES.action);
    }
  }

  function startEditingAdminUser(user) {
    const mentorProfile = Array.isArray(user.mentor_profiles)
      ? user.mentor_profiles[0]
      : user.mentor_profiles;
    const menteeProfile = Array.isArray(user.mentee_profiles)
      ? user.mentee_profiles[0]
      : user.mentee_profiles;
    const availabilityInfo = parseMentorAvailability(
      mentorProfile?.availability,
    );

    setAdminEditingUserId(user.id);
    setAdminProfileForm({
      ...EMPTY_ADMIN_PROFILE_FORM,
      role: user.role,
      username: user.username ?? "",
      fullName: user.full_name ?? "",
      university: user.university ?? "",
      bio: user.bio ?? "",
      approvalStatus: user.approval_status ?? "pending",
      isVisible: Boolean(user.is_visible),
      sameUniversityOnly: user.same_university_only !== false,
      mentorMode: availabilityInfo.mentorMode,
      availability: availabilityInfo.availability,
      goals: menteeProfile?.goals ?? "",
      interests: (menteeProfile?.interests ?? []).join(", "),
    });
  }

  async function handleSaveAdminProfile(event) {
    event.preventDefault();
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) return;

    const values = adminProfileForm;
    const payload = {
      role: values.role,
      username: values.username.trim(),
      full_name: values.fullName.trim(),
      university: values.university,
      bio: values.bio.trim() || null,
      approval_status: values.approvalStatus,
      is_visible: values.isVisible,
      same_university_only: values.sameUniversityOnly,
      availability: buildMentorAvailability(
        values.availability,
        values.mentorMode,
      ),
      goals: values.goals.trim() || null,
      interests: parseCommaSeparated(values.interests),
    };
    if (!payload.username) delete payload.username;
    if (!adminEditingUserId) {
      payload.email = values.email.trim();
      payload.password = values.password;
    }

    setIsAdminProfileSaving(true);
    setAdminError("");
    setAdminSuccess("");
    try {
      const response = await apiFetch(
        adminEditingUserId
          ? `${BACKEND_BASE_URL}/api/admin/users/${adminEditingUserId}`
          : `${BACKEND_BASE_URL}/api/admin/users`,
        {
          method: adminEditingUserId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error();
      }

      setAdminSuccess(
        adminEditingUserId ? "Profile updated." : "Account and profile created.",
      );
      resetAdminProfileForm();
      await loadAdminDashboardData();
    } catch (_error) {
      setAdminError(ERROR_MESSAGES.save);
    } finally {
      setIsAdminProfileSaving(false);
    }
  }

  function updateProgramApplication(field, value) {
    setProgramApplication((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleApplicationSubmit(event) {
    event.preventDefault();
    setIsApplicationSubmitting(true);
    setAuthError("");
    setAuthSuccess("");

    const isCaregiverApplication = signupRole === "mentee";
    const payload = {
      application_type: isCaregiverApplication ? "caregiver" : "volunteer",
      full_legal_name: programApplication.fullLegalName.trim(),
      preferred_name: programApplication.preferredName.trim(),
      email: programApplication.email.trim(),
      phone_number: programApplication.phoneNumber.trim(),
      date_of_birth: programApplication.dateOfBirth,
      university: programApplication.university || null,
      consent_acknowledged: programApplication.consentAcknowledged,
    };

    if (isCaregiverApplication) {
      payload.caregiving_situation =
        programApplication.caregivingSituation.trim();
      payload.support_requested = programApplication.supportRequested.trim();
      payload.communication_preference =
        programApplication.communicationPreference;
      payload.accessibility_needs =
        programApplication.accessibilityNeeds.trim() || null;
      payload.additional_information =
        programApplication.additionalInformation.trim() || null;
    } else {
      payload.volunteer_motivation =
        programApplication.volunteerMotivation.trim();
      payload.caregiving_experience =
        programApplication.caregivingExperience.trim();
      payload.other_relevant_experience =
        programApplication.otherRelevantExperience.trim() || null;
      payload.school_program_interest =
        programApplication.schoolProgramInterest.trim() || null;
    }

    try {
      const response = await apiFetch(`${BACKEND_BASE_URL}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        throw new Error(
          typeof responseBody?.detail === "string"
            ? responseBody.detail
            : ERROR_MESSAGES.auth,
        );
      }

      setAuthSuccess(
        "Application submitted. Our team will review it and contact you about next steps.",
      );
    } catch (error) {
      setAuthError(error.message || ERROR_MESSAGES.auth);
    } finally {
      setIsApplicationSubmitting(false);
    }
  }

  async function handleUnlock(event) {
    event.preventDefault();
    if (!hasSupabaseEnv || !supabase) {
      setAuthError("The service is temporarily unavailable. Please try again later.");
      return;
    }

    if (!emailInput.trim() || !passwordInput.trim()) {
      setAuthError("Email and password are required.");
      return;
    }
    if (authMode === "signup" && !signupUsername.trim()) {
      setAuthError("Username is required.");
      return;
    }
    if (authMode === "signup" && !signupUniversity) {
      setAuthError("Select your Ontario university.");
      return;
    }

    setIsAuthLoading(true);
    setAuthError("");
    setAuthSuccess("");

    async function syncSignupProfile(token) {
      const payload = {
        role: signupRole,
        username: signupUsername.trim(),
        full_name:
          signupFullName.trim() ||
          emailInput.trim().split("@")[0] ||
          "New User",
        bio: signupBio.trim() || null,
        university: signupUniversity,
      };

      if (signupRole === "mentor") {
        payload.availability = buildMentorAvailability(
          signupAvailability,
          signupMentorMode,
        );
      }

      if (signupRole === "mentee") {
        payload.goals = signupGoals.trim() || null;
        payload.interests = parseCommaSeparated(signupInterests);
      }

      const response = await apiFetch(
        `${BACKEND_BASE_URL}/api/auth/sync-profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        throw new Error();
      }
    }

    try {
      if (authMode === "signup") {
        const signupMetadata = {
          full_name:
            signupFullName.trim() ||
            emailInput.trim().split("@")[0] ||
            "New User",
          role: signupRole,
          username: signupUsername.trim(),
          bio: signupBio.trim() || null,
          university: signupUniversity,
        };

        if (signupRole === "mentor") {
          signupMetadata.availability = buildMentorAvailability(
            signupAvailability,
            signupMentorMode,
          );
        } else {
          signupMetadata.goals = signupGoals.trim() || null;
          signupMetadata.interests = parseCommaSeparated(signupInterests);
        }

        const { data, error } = await supabase.auth.signUp({
          email: emailInput.trim(),
          password: passwordInput,
          options: {
            data: signupMetadata,
          },
        });
        if (error) throw error;

        if (data.session?.access_token) {
          window.localStorage.setItem(
            "ocgoAccessToken",
            data.session.access_token,
          );
          await syncSignupProfile(data.session.access_token);
          setAuthSuccess("Account created and profile initialized.");
        } else {
          setAuthSuccess("Account created. Please check your email before signing in.");
          setAuthMode("signin");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailInput.trim(),
          password: passwordInput,
        });
        if (error) throw error;
        if (data.session?.access_token) {
          window.localStorage.setItem(
            "ocgoAccessToken",
            data.session.access_token,
          );
          setAuthSuccess("Signed in successfully.");
        }
      }
    } catch (_error) {
      setAuthError(ERROR_MESSAGES.auth);
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleSendMatch() {
    if (!selectedVolunteerId) return;
    if (!careType) {
      setRequestError("Please select the type of support you need.");
      return;
    }
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setRequestError("Your session ended. Please sign in again.");
      return;
    }

    setIsSendingMatch(true);
    setRequestError("");

    try {
      const response = await apiFetch(`${BACKEND_BASE_URL}/api/matches/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mentor_id: selectedVolunteerId,
          care_type: careType,
        }),
      });

      if (!response.ok) {
        throw new Error();
      }

      await loadMenteeRequestsData();
      setIsMatchSent(true);
    } catch (_error) {
      setRequestError(ERROR_MESSAGES.action);
    } finally {
      setIsSendingMatch(false);
    }
  }

  function handleSelectVolunteer(volunteerId) {
    const shouldDeselect = selectedVolunteerId === volunteerId;
    setSelectedVolunteerId(shouldDeselect ? "" : volunteerId);
    setRequestError("");
    setCareType("");
  }

  function openRoleSignup(role) {
    setAuthError("");
    setAuthSuccess("");
    setAuthMode("signup");
    setSignupRole(role);
    setIsSignupRoleLocked(true);
    setProgramApplication(EMPTY_PROGRAM_APPLICATION);
    setIsAboutPage(false);
    setIsAuthPortalOpen(true);
  }

  function showAboutPage() {
    setAuthError("");
    setAuthSuccess("");
    setIsAuthPortalOpen(false);
    setIsAboutPage(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showHomePage(sectionId) {
    setAuthError("");
    setAuthSuccess("");
    setIsAuthPortalOpen(false);
    setIsAboutPage(false);
    if (sectionId) {
      requestAnimationFrame(() =>
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" }),
      );
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showMemberSignin() {
    setAuthError("");
    setAuthSuccess("");
    setAuthMode("signin");
    setIsSignupRoleLocked(false);
    setIsAboutPage(false);
    setIsAuthPortalOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStartOver() {
    if (supabase) {
      supabase.auth.signOut();
    }
    window.localStorage.removeItem("ocgoAccessToken");
    setEmailInput("");
    setPasswordInput("");
    setProgramApplication(EMPTY_PROGRAM_APPLICATION);
    setIsApplicationSubmitting(false);
    setIsUnlocked(false);
    setIsAuthPortalOpen(false);
    setIsAboutPage(false);
    setIsAuthLoading(false);
    setAuthError("");
    setAuthSuccess("");
    setSignupRole("mentee");
    setIsSignupRoleLocked(false);
    setSignupUsername("");
    setSignupFullName("");
    setSignupUniversity("");
    setSignupBio("");
    setSignupMentorMode("Remote");
    setSignupAvailability("");
    setSignupGoals("");
    setSignupInterests("");
    setSelectedVolunteerId("");
    setIsMatchSent(false);
    setIsSendingMatch(false);
    setCareType("");
    setRequestError("");
    setMenteeRequests([]);
    setIsLoadingMenteeRequests(false);
    setMenteeRequestsError("");
    setSearchQuery("");
    setUniversityFilter("all");
    setAvailabilityFilter("all");
    setIncludeOtherUniversities(false);
    setDidAutoExpandUniversitySearch(false);
    setProfileData(null);
    setIsProfileLoading(false);
    setIsProfileSaving(false);
    setProfileError("");
    setProfileSaveMessage("");
    setIsProfileMenuOpen(false);
    setIsSettingsOpen(false);
    setAdminPendingUsers([]);
    setAdminReviewedUsers([]);
    setAdminProgramApplications([]);
    setAdminReviewedProgramApplications([]);
    setAdminMetrics(null);
    setAdminMentors([]);
    setAdminMatches([]);
    setAdminUsers([]);
    setAdminPreapprovedEmails([]);
    setAdminInviteForm(EMPTY_ADMIN_INVITE_FORM);
    setAdminProfileForm(EMPTY_ADMIN_PROFILE_FORM);
    setAdminEditingUserId("");
    setIsAdminInviteSaving(false);
    setIsAdminProfileSaving(false);
    setAdminMatchStatusFilter("all");
    setAdminSessionEntries([]);
    setAdminSessionsTotal(0);
    setAdminSessionMentorFilter("all");
    setIsAdminLoading(false);
    setAdminError("");
    setAdminSuccess("");
    setAdminActionUserId("");
    setAdminSelectedReviewedUser(null);
    setAdminSelectedMentor(null);
    setAdminSelectedMentorRequests([]);
    setIsLoadingAdminMentorDetails(false);
    setAdminMentorDetailsError("");
    setAdminViewMode("admin");
    setMentorViewMode("requests");
    setMentorRequests([]);
    setIsLoadingMentorRequests(false);
    setMentorRequestsError("");
    setMentorDecisionLoadingId(null);
    setMentorDecisionError("");
    setMentorDecisionSuccess("");
    setMentorHoursForm({
      matchId: "",
      meetingDate: "",
      hours: "",
      nextMeeting: "",
      topicsDiscussed: "",
      anythingToFlag: "",
    });
    setIsMentorHoursLoading(false);
    setIsMentorHoursSaving(false);
    setMentorHoursError("");
    setMentorHoursSuccess("");
    setMentorHoursEntries([]);
    setMentorHoursTotal(0);
    setProfileForm({
      role: "mentee",
      username: "",
      fullName: "",
      university: "",
      bio: "",
      isVisible: false,
      sameUniversityOnly: true,
      mentorMode: "Remote",
      availability: "",
      goals: "",
      interests: "",
    });
  }

  function handleRequestAnotherMentor() {
    setSelectedVolunteerId("");
    setIsMatchSent(false);
    setIsSendingMatch(false);
    setCareType("");
    setRequestError("");
  }

  const showVolunteerApplication =
    !isUnlocked &&
    isAuthPortalOpen &&
    authMode === "signup" &&
    signupRole === "mentor" &&
    isSignupRoleLocked;
  const showCaregiverApplication =
    !isUnlocked &&
    isAuthPortalOpen &&
    authMode === "signup" &&
    signupRole === "mentee" &&
    isSignupRoleLocked;
  const showRoleApplication =
    showVolunteerApplication || showCaregiverApplication;
  const showPublicSiteHeader =
    !isUnlocked && (!isAuthPortalOpen || showRoleApplication);

  return (
    <div className="min-h-screen bg-[#e8e5dd] text-[#0c0a08]">
      <header className={`sticky top-0 z-40 border-b border-[#d3d1c8] backdrop-blur-md ${showPublicSiteHeader ? "site-header" : "bg-[#e8e5dd]/95"}`}>
        <div className={`mx-auto flex w-full items-center justify-between gap-3 ${showPublicSiteHeader ? "site-shell site-header-inner" : "max-w-7xl px-4 py-3 sm:px-6 lg:px-8"}`}>
          {showPublicSiteHeader ? (
            <button
              type="button"
              className="site-brand-link"
              aria-label="QYCC home"
              onClick={() => showHomePage()}
            >
              <HeartMark />
              <div>
                <p className="site-brand-title">Peer support program for young caregivers</p>
                <p className="site-brand-subtitle">Made by Queen&apos;s Young Caregivers Community (QYCC)</p>
              </div>
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2a3723] text-lg text-[#dcbc98]"
              >
                C
              </span>
              <div>
                <>
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[#2a3723]">
                    Peer Support Portal
                  </p>
                  <p className="max-w-52 text-base font-bold leading-tight text-[#0c0a08] sm:max-w-none sm:text-lg">
                    Caregiver Volunteer Matching
                  </p>
                </>
              </div>
            </div>
          )}
          {showPublicSiteHeader && (
            <nav className="site-nav" aria-label="Main navigation">
              <button
                type="button"
                onClick={showAboutPage}
              >
                About
              </button>
              <button
                type="button"
                onClick={() => openRoleSignup("mentee")}
              >
                For caregivers
              </button>
              <button
                type="button"
                onClick={() => openRoleSignup("mentor")}
              >
                For volunteers
              </button>
              <button
                type="button"
                className="site-nav-signin"
                onClick={showMemberSignin}
              >
                Sign in
              </button>
            </nav>
          )}
          {!isUnlocked && isAuthPortalOpen && !showRoleApplication && (
            <button
              type="button"
              onClick={() => showHomePage()}
              className="text-sm font-bold text-[#2a3723] underline underline-offset-4"
            >
              Back to home
            </button>
          )}
          {isUnlocked && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[#b9bba8] bg-[#f4f2ec] text-sm font-bold text-[#2a3723]"
                aria-label="Open profile menu"
              >
                {userInitial}
              </button>

              {isProfileMenuOpen && (
                <div className="pop-in absolute right-0 mt-2 w-48 rounded-md border border-[#d3d1c8] bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#2a3723] hover:bg-[#f4f2ec]"
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      handleStartOver();
                    }}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#9b2c2c] hover:bg-[#fff2f2]"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main
        className={
          (!isUnlocked && !isAuthPortalOpen) || showRoleApplication
            ? "w-full"
            : "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        }
      >
        {!isUnlocked && !isAuthPortalOpen && !isAboutPage && (
          <div className="landing-site">
            <section className="site-hero">
              <div className="site-shell hero-layout">
                <div className="hero-copy">
                  <p className="community-pill"><LineIcon name="community" /> Queen&apos;s Young Caregivers Community</p>
                  <h1>Peer support, from<br />people who <em>get it.</em></h1>
                  <p className="hero-description">
                    We connect young caregivers with trained peer support volunteers who&apos;ve lived through caregiving themselves; people close to your age, your campus, your situation.
                  </p>
                  <div className="hero-actions">
                    <button
                      type="button"
                      className="site-button site-button-dark"
                      onClick={() => openRoleSignup("mentee")}
                    >
                      I&apos;m a young caregiver <span aria-hidden="true">→</span>
                    </button>
                    <button
                      type="button"
                      className="site-button site-button-tan"
                      onClick={() => openRoleSignup("mentor")}
                    >
                      I want to volunteer
                    </button>
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <span className="hero-circle hero-circle-small" />
                  <span className="hero-circle hero-circle-large" />
                </div>
              </div>
            </section>

            <section className="how-section" id="how-it-works">
              <div className="site-shell">
                <h2>How it works</h2>
                <div className="step-grid">
                  <article className="step-card">
                    <div className="step-meta"><LineIcon name="apply" /><span>Step 1</span></div>
                    <h3>Apply</h3>
                    <p>Caregivers and volunteers each fill out a short interest form. It only takes a few minutes.</p>
                  </article>
                  <article className="step-card">
                    <div className="step-meta"><LineIcon name="review" /><span>Step 2</span></div>
                    <h3>We review</h3>
                    <p>Caregivers are reviewed and approved by our team. Volunteers are interviewed and complete training designed in partnership with the Ontario Caregiver Organization (OCO).</p>
                  </article>
                  <article className="step-card">
                    <div className="step-meta"><LineIcon name="connect" /><span>Step 3</span></div>
                    <h3>Connect</h3>
                    <p>Once approved, caregivers can find a peer supporter who fits their situation, at their school or elsewhere.</p>
                  </article>
                </div>
              </div>
            </section>

            <section className="trust-section" id="about">
              <div className="site-shell">
                <h2>You&apos;re in good hands</h2>
                <div className="trust-grid">
                  <article className="trust-item">
                    <LineIcon name="shield" />
                    <div><h3>Vetted &amp; trained</h3><p>Every volunteer is carefully interviewed and completes specialized training provided by the OCO.</p></div>
                  </article>
                  <article className="trust-item">
                    <LineIcon name="campus" />
                    <div><h3>Rooted on campus</h3><p>The program started at Queen&apos;s University and is expanding to other campuses across Ontario.</p></div>
                  </article>
                  <article className="trust-item">
                    <LineIcon name="community" />
                    <div><h3>Built by community</h3><p>A partnership between QYCC and OCO, led by young people who&apos;ve cared for loved ones themselves.</p></div>
                  </article>
                </div>
              </div>
            </section>

            <section className="volunteer-callout">
              <div className="site-shell callout-layout">
                <div>
                  <h2>We&apos;re looking for volunteers and<br />student leaders, especially outside<br />Queen&apos;s.</h2>
                  <p>If you&apos;ve cared for a family member and you&apos;re at another university or college, this is a chance to bring peer support and caregiver advocacy to your own campus. Apply to be a volunteer and let us know you&apos;re interested!</p>
                </div>
                <button
                  type="button"
                  className="site-button site-button-dark"
                  onClick={() => openRoleSignup("mentor")}
                >
                  Apply to volunteer <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>

            <footer className="site-footer">
              <div className="site-shell footer-grid">
                <div>
                  <p className="footer-brand"><HeartMark inverted /> <span>QYCC</span></p>
                  <p>Queen&apos;s Young Caregivers Community</p>
                </div>
                <div>
                  <h3>Get involved</h3>
                  <button type="button" onClick={() => openRoleSignup("mentee")}>Get support</button>
                  <button type="button" onClick={() => openRoleSignup("mentor")}>Volunteer</button>
                  <button type="button" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>How it works</button>
                </div>
                <div>
                  <h3>Contact</h3>
                  <a href="mailto:youngcaregiverscommunity@clubs.queensu.ca">youngcaregiverscommunity@clubs.queensu.ca</a>
                  <a href="https://www.instagram.com/queensyoungcaregivers/" target="_blank" rel="noreferrer">IG: @queensyoungcaregivers</a>
                </div>
              </div>
              <div className="site-shell footer-bottom">
                <p>© 2026 Queen&apos;s Young Caregivers Community. In partnership with the Ontario Caregiver Organization.</p>
                <button type="button" onClick={() => { setAuthMode("signin"); setSignupRole("mentee"); setIsSignupRoleLocked(false); setIsAboutPage(false); setIsAuthPortalOpen(true); }}>Member sign in</button>
              </div>
            </footer>
          </div>
        )}

        {!isUnlocked && !isAuthPortalOpen && isAboutPage && (
          <div className="about-page">
            <section className="about-section">
              <div className="about-shell">
                <h1>About</h1>

                <section>
                  <h2>What we do</h2>
                  <p>
                    We connect young caregivers with trained peer support
                    volunteers; people who&apos;ve cared for loved ones themselves
                    and understand what that actually looks like day to day. A
                    lot of young caregivers go through this without knowing
                    anyone else their age who&apos;s in the same position, and that
                    isolation is common especially because caregiving at a young
                    age isn&apos;t something most people around you have experienced.
                    Peer support exists to close that gap: someone to talk to who
                    doesn&apos;t need the situation explained to them.
                  </p>
                </section>

                <section>
                  <h2>Where we started</h2>
                  <p>
                    QYCC was founded at Queen&apos;s University in 2023 to support
                    young caregivers on campus. What began as a small community
                    has grown into a peer support program, and we&apos;re officially
                    launching it this summer, in 2026.
                  </p>
                </section>

                <section>
                  <h2>Where we&apos;re headed</h2>
                  <p>
                    One day we hope every young caregiver will have a place to
                    connect with someone who gets it. That means growing beyond
                    Queen&apos;s and building a network of trained peer support
                    volunteers across universities and colleges, so a young
                    caregiver anywhere in Ontario can find someone nearby, or
                    find someone whose situation looks like theirs.
                  </p>
                </section>

                <section>
                  <h2>Start a program at your school</h2>
                  <p>
                    We&apos;re looking for student leaders at other universities and
                    colleges who want to bring peer support to their own campus.
                    This doesn&apos;t mean building something from scratch; we&apos;ll
                    support you with training, structure, and the operational
                    pieces we&apos;ve already worked out at Queen&apos;s. If you&apos;ve cared
                    for a family member and want to help other students going
                    through the same thing, lean on what we&apos;ve already built, and
                    grow it into something your campus needs.
                  </p>
                </section>

                <button
                  type="button"
                  className="site-button site-button-dark about-cta"
                  onClick={() => openRoleSignup("mentor")}
                >
                  Apply to volunteer <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>

            <footer className="site-footer">
              <div className="site-shell footer-grid">
                <div>
                  <p className="footer-brand"><HeartMark inverted /> <span>QYCC</span></p>
                  <p>Queen&apos;s Young Caregivers Community</p>
                </div>
                <div>
                  <h3>Get involved</h3>
                  <button type="button" onClick={() => openRoleSignup("mentee")}>Get support</button>
                  <button type="button" onClick={() => openRoleSignup("mentor")}>Volunteer</button>
                  <button type="button" onClick={() => showHomePage("how-it-works")}>How it works</button>
                </div>
                <div>
                  <h3>Contact</h3>
                  <a href="mailto:youngcaregiverscommunity@clubs.queensu.ca">youngcaregiverscommunity@clubs.queensu.ca</a>
                  <a href="https://www.instagram.com/queensyoungcaregivers/" target="_blank" rel="noreferrer">IG: @queensyoungcaregivers</a>
                </div>
              </div>
              <div className="site-shell footer-bottom">
                <p>© 2026 Queen&apos;s Young Caregivers Community. In partnership with the Ontario Caregiver Organization.</p>
              </div>
            </footer>
          </div>
        )}

        {showCaregiverApplication && (
          <div className="volunteer-application-page caregiver-application-page">
            <section className="volunteer-application-section">
              <div className="volunteer-application-shell">
                <button
                  type="button"
                  className="application-back"
                  onClick={() => showHomePage()}
                >
                  <span aria-hidden="true">←</span> Back to home
                </button>

                <div className="application-heading">
                  <h1>Get Matched with a Peer Supporter</h1>
                  <p>
                    This is an interest form to get connected with a trained peer
                    support volunteer. Submissions are reviewed by our team, and
                    you don&apos;t need to be part of a university or college to
                    apply.
                  </p>
                </div>

                <form className="application-form" onSubmit={handleApplicationSubmit}>
                  <div className="application-field">
                    <label htmlFor="caregiver-full-legal-name">
                      Full legal name * <span>(Used internally only)</span>
                    </label>
                    <input
                      id="caregiver-full-legal-name"
                      type="text"
                      value={programApplication.fullLegalName}
                      onChange={(event) =>
                        updateProgramApplication("fullLegalName", event.target.value)
                      }
                      autoComplete="name"
                      maxLength={120}
                      required
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="caregiver-preferred-name">
                      Preferred name * <span>(Shown to your volunteer match)</span>
                    </label>
                    <input
                      id="caregiver-preferred-name"
                      type="text"
                      value={programApplication.preferredName}
                      onChange={(event) =>
                        updateProgramApplication("preferredName", event.target.value)
                      }
                      maxLength={120}
                      required
                    />
                  </div>

                  <div className="application-two-column">
                    <div className="application-field">
                      <label htmlFor="caregiver-email">Email *</label>
                      <input
                        id="caregiver-email"
                        type="email"
                        value={programApplication.email}
                        onChange={(event) =>
                          updateProgramApplication("email", event.target.value)
                        }
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div className="application-field">
                      <label htmlFor="caregiver-phone">Phone number *</label>
                      <input
                        id="caregiver-phone"
                        type="tel"
                        value={programApplication.phoneNumber}
                        onChange={(event) =>
                          updateProgramApplication("phoneNumber", event.target.value)
                        }
                        autoComplete="tel"
                        maxLength={40}
                        required
                      />
                    </div>
                  </div>

                  <div className="application-field">
                    <label htmlFor="caregiver-date-of-birth">Date of birth *</label>
                    <input
                      id="caregiver-date-of-birth"
                      type="date"
                      value={programApplication.dateOfBirth}
                      onChange={(event) =>
                        updateProgramApplication("dateOfBirth", event.target.value)
                      }
                      autoComplete="bday"
                      required
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="caregiver-university">
                      What university or post-secondary institution are you a part of, if any?
                      <span>(Optional — you don&apos;t need to be enrolled anywhere)</span>
                    </label>
                    <select
                      id="caregiver-university"
                      value={programApplication.university}
                      onChange={(event) =>
                        updateProgramApplication("university", event.target.value)
                      }
                    >
                      <option value="">Select your school (optional)</option>
                      {ONTARIO_POSTSECONDARY_INSTITUTIONS.map((institution) => (
                        <option key={institution} value={institution}>
                          {institution}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="application-field">
                    <label htmlFor="caregiver-situation">
                      Tell us about your caregiving situation *
                      <span>(A brief 1–2 sentences — shared with a prospective volunteer)</span>
                    </label>
                    <textarea
                      id="caregiver-situation"
                      value={programApplication.caregivingSituation}
                      onChange={(event) =>
                        updateProgramApplication("caregivingSituation", event.target.value)
                      }
                      rows={4}
                      maxLength={2000}
                      placeholder="Who you care for and a bit about your day-to-day (a short summary is enough)"
                      required
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="caregiver-support-requested">
                      What kind of support are you looking for? *
                    </label>
                    <textarea
                      id="caregiver-support-requested"
                      value={programApplication.supportRequested}
                      onChange={(event) =>
                        updateProgramApplication("supportRequested", event.target.value)
                      }
                      rows={4}
                      maxLength={2000}
                      required
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="caregiver-communication">
                      How do you prefer to communicate? *
                    </label>
                    <select
                      id="caregiver-communication"
                      value={programApplication.communicationPreference}
                      onChange={(event) =>
                        updateProgramApplication(
                          "communicationPreference",
                          event.target.value,
                        )
                      }
                      required
                    >
                      <option value="">Select a preference</option>
                      <option value="Text">Text</option>
                      <option value="Email">Email</option>
                      <option value="Phone call">Phone call</option>
                      <option value="Video call">Video call</option>
                      <option value="No preference">No preference</option>
                    </select>
                  </div>

                  <div className="application-field">
                    <label htmlFor="caregiver-accessibility">
                      Accessibility needs <span>(Optional)</span>
                    </label>
                    <textarea
                      id="caregiver-accessibility"
                      value={programApplication.accessibilityNeeds}
                      onChange={(event) =>
                        updateProgramApplication("accessibilityNeeds", event.target.value)
                      }
                      rows={4}
                      maxLength={2000}
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="caregiver-additional-information">
                      Anything else you&apos;d like our team to know?
                      <span>(This stays internal to QYCC — it is not shared with a volunteer)</span>
                    </label>
                    <textarea
                      id="caregiver-additional-information"
                      value={programApplication.additionalInformation}
                      onChange={(event) =>
                        updateProgramApplication("additionalInformation", event.target.value)
                      }
                      rows={4}
                      maxLength={2000}
                    />
                  </div>

                  <p className="application-privacy-note">
                    If you request a mentor, selected information from this form
                    will be shared with that mentor so they can decide whether
                    they are comfortable accepting the match. This may include
                    your preferred name, broad caregiving situation, support
                    goals, availability, preferred communication method,
                    accessibility needs, and relevant matching preferences.
                    Direct contact information, if required, is shared only
                    after the mentor accepts. QYCC coordinators may access
                    information and website messages for program administration,
                    safety, supervision, and quality assurance. The website is
                    not an emergency service.
                  </p>

                  <label className="application-consent">
                    <input
                      type="checkbox"
                      checked={programApplication.consentAcknowledged}
                      onChange={(event) =>
                        updateProgramApplication(
                          "consentAcknowledged",
                          event.target.checked,
                        )
                      }
                      required
                    />
                    <span>
                      I understand and agree to how my information will be used
                      and shared.
                    </span>
                  </label>

                  {authError && (
                    <p className="application-message application-error">{authError}</p>
                  )}
                  {authSuccess && (
                    <p className="application-message application-success">{authSuccess}</p>
                  )}

                  <div className="application-submit-row">
                    <button
                      type="submit"
                      disabled={
                        isApplicationSubmitting ||
                        !programApplication.consentAcknowledged
                      }
                    >
                      {isApplicationSubmitting
                        ? "Please wait..."
                        : "Submit Application"}
                    </button>
                    <button
                      type="button"
                      className="application-signin-link"
                      onClick={showMemberSignin}
                    >
                      Already a member? Sign in
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <footer className="site-footer">
              <div className="site-shell footer-grid">
                <div>
                  <p className="footer-brand"><HeartMark inverted /> <span>QYCC</span></p>
                  <p>Queen&apos;s Young Caregivers Community</p>
                </div>
                <div>
                  <h3>Get involved</h3>
                  <button type="button" onClick={() => openRoleSignup("mentee")}>Get support</button>
                  <button type="button" onClick={() => openRoleSignup("mentor")}>Volunteer</button>
                  <button type="button" onClick={() => showHomePage("how-it-works")}>How it works</button>
                </div>
                <div>
                  <h3>Contact</h3>
                  <a href="mailto:youngcaregiverscommunity@clubs.queensu.ca">youngcaregiverscommunity@clubs.queensu.ca</a>
                  <a href="https://www.instagram.com/queensyoungcaregivers/" target="_blank" rel="noreferrer">IG: @queensyoungcaregivers</a>
                </div>
              </div>
              <div className="site-shell footer-bottom">
                <p>© 2026 Queen&apos;s Young Caregivers Community. In partnership with the Ontario Caregiver Organization.</p>
              </div>
            </footer>
          </div>
        )}

        {showVolunteerApplication && (
          <div className="volunteer-application-page">
            <section className="volunteer-application-section">
              <div className="volunteer-application-shell">
                <button
                  type="button"
                  className="application-back"
                  onClick={() => showHomePage()}
                >
                  <span aria-hidden="true">←</span> Back to home
                </button>

                <div className="application-heading">
                  <h1>Apply to Be a Peer Support Volunteer</h1>
                  <p>
                    After you submit, the next step is a short interview,
                    followed by training adapted from the Ontario Caregiver
                    Organization!
                  </p>
                </div>

                <form className="application-form" onSubmit={handleApplicationSubmit}>
                  <div className="application-field">
                    <label htmlFor="volunteer-full-legal-name">
                      Full legal name * <span>(Used internally only)</span>
                    </label>
                    <input
                      id="volunteer-full-legal-name"
                      type="text"
                      value={programApplication.fullLegalName}
                      onChange={(event) =>
                        updateProgramApplication("fullLegalName", event.target.value)
                      }
                      autoComplete="name"
                      maxLength={120}
                      required
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="volunteer-preferred-name">
                      Preferred name * <span>(Shown on your public profile)</span>
                    </label>
                    <input
                      id="volunteer-preferred-name"
                      type="text"
                      value={programApplication.preferredName}
                      onChange={(event) =>
                        updateProgramApplication("preferredName", event.target.value)
                      }
                      maxLength={120}
                      required
                    />
                  </div>

                  <div className="application-two-column">
                    <div className="application-field">
                      <label htmlFor="volunteer-email">Email *</label>
                      <input
                        id="volunteer-email"
                        type="email"
                        value={programApplication.email}
                        onChange={(event) =>
                          updateProgramApplication("email", event.target.value)
                        }
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div className="application-field">
                      <label htmlFor="volunteer-phone">Phone number *</label>
                      <input
                        id="volunteer-phone"
                        type="tel"
                        value={programApplication.phoneNumber}
                        onChange={(event) =>
                          updateProgramApplication("phoneNumber", event.target.value)
                        }
                        autoComplete="tel"
                        maxLength={40}
                        required
                      />
                    </div>
                  </div>

                  <div className="application-field">
                    <label htmlFor="volunteer-date-of-birth">Date of birth *</label>
                    <input
                      id="volunteer-date-of-birth"
                      type="date"
                      value={programApplication.dateOfBirth}
                      onChange={(event) =>
                        updateProgramApplication("dateOfBirth", event.target.value)
                      }
                      autoComplete="bday"
                      required
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="volunteer-university">
                      What university or post-secondary institution are you a part of? *
                    </label>
                    <select
                      id="volunteer-university"
                      value={programApplication.university}
                      onChange={(event) =>
                        updateProgramApplication("university", event.target.value)
                      }
                      required
                    >
                      <option value="">Select your school</option>
                      {ONTARIO_POSTSECONDARY_INSTITUTIONS.map((institution) => (
                        <option key={institution} value={institution}>
                          {institution}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="application-field">
                    <label htmlFor="volunteer-motivation">
                      Why are you interested in becoming a peer support volunteer? *
                    </label>
                    <textarea
                      id="volunteer-motivation"
                      value={programApplication.volunteerMotivation}
                      onChange={(event) =>
                        updateProgramApplication("volunteerMotivation", event.target.value)
                      }
                      rows={4}
                      maxLength={2000}
                      required
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="volunteer-caregiving-experience">
                      Tell us more about your experience as a young caregiver. *
                    </label>
                    <textarea
                      id="volunteer-caregiving-experience"
                      value={programApplication.caregivingExperience}
                      onChange={(event) =>
                        updateProgramApplication("caregivingExperience", event.target.value)
                      }
                      rows={4}
                      maxLength={2000}
                      required
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="volunteer-other-experience">
                      Do you have any other experiences that might support you in this role?
                      <span>(Optional)</span>
                    </label>
                    <textarea
                      id="volunteer-other-experience"
                      value={programApplication.otherRelevantExperience}
                      onChange={(event) =>
                        updateProgramApplication(
                          "otherRelevantExperience",
                          event.target.value,
                        )
                      }
                      rows={4}
                      maxLength={2000}
                    />
                  </div>

                  <div className="application-field">
                    <label htmlFor="volunteer-school-program-interest">
                      Are you interested in starting a peer support program at your own school?
                      <span>(Optional — tell us why, and what makes you qualified)</span>
                    </label>
                    <textarea
                      id="volunteer-school-program-interest"
                      value={programApplication.schoolProgramInterest}
                      onChange={(event) =>
                        updateProgramApplication("schoolProgramInterest", event.target.value)
                      }
                      rows={4}
                      maxLength={2000}
                    />
                  </div>

                  <p className="application-privacy-note">
                    Information you provide may be used to assess eligibility,
                    create a mentor profile, support matching, administer the
                    program, and address safety or conduct concerns. Your public
                    profile will contain only the fields shown to you for
                    approval. Your private contact and screening information
                    will not be shown to mentees unless you expressly choose an
                    approved contact method that requires disclosure.
                  </p>

                  <label className="application-consent">
                    <input
                      type="checkbox"
                      checked={programApplication.consentAcknowledged}
                      onChange={(event) =>
                        updateProgramApplication(
                          "consentAcknowledged",
                          event.target.checked,
                        )
                      }
                      required
                    />
                    <span>
                      I understand and agree to how my information will be used
                      and shared.
                    </span>
                  </label>

                  {authError && (
                    <p className="application-message application-error">{authError}</p>
                  )}
                  {authSuccess && (
                    <p className="application-message application-success">{authSuccess}</p>
                  )}

                  <div className="application-submit-row">
                    <button
                      type="submit"
                      disabled={
                        isApplicationSubmitting ||
                        !programApplication.consentAcknowledged
                      }
                    >
                      {isApplicationSubmitting
                        ? "Please wait..."
                        : "Submit Application"}
                    </button>
                    <button
                      type="button"
                      className="application-signin-link"
                      onClick={showMemberSignin}
                    >
                      Already a member? Sign in
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <footer className="site-footer">
              <div className="site-shell footer-grid">
                <div>
                  <p className="footer-brand"><HeartMark inverted /> <span>QYCC</span></p>
                  <p>Queen&apos;s Young Caregivers Community</p>
                </div>
                <div>
                  <h3>Get involved</h3>
                  <button type="button" onClick={() => openRoleSignup("mentee")}>Get support</button>
                  <button type="button" onClick={() => openRoleSignup("mentor")}>Volunteer</button>
                  <button type="button" onClick={() => showHomePage("how-it-works")}>How it works</button>
                </div>
                <div>
                  <h3>Contact</h3>
                  <a href="mailto:youngcaregiverscommunity@clubs.queensu.ca">youngcaregiverscommunity@clubs.queensu.ca</a>
                  <a href="https://www.instagram.com/queensyoungcaregivers/" target="_blank" rel="noreferrer">IG: @queensyoungcaregivers</a>
                </div>
              </div>
              <div className="site-shell footer-bottom">
                <p>© 2026 Queen&apos;s Young Caregivers Community. In partnership with the Ontario Caregiver Organization.</p>
              </div>
            </footer>
          </div>
        )}

        {!isUnlocked && isAuthPortalOpen && !showRoleApplication && (
          <section className="mx-auto w-full max-w-3xl rounded-lg border border-[#d3d1c8] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase text-[#2a3723]">
              Peer Support Portal
            </p>
            <h1 className="mt-2 text-4xl font-medium text-[#0c0a08]">
              {authMode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#59604f]">
              {authMode === "signup"
                ? "Tell us who you are and your university. An administrator will review your profile before portal access is unlocked."
                : "Sign in to manage your profile, requests, matches, and volunteer hours."}
            </p>
            <form
              className="mt-7 flex flex-col gap-3 sm:max-w-xl"
              onSubmit={handleUnlock}
            >
              <label
                htmlFor="portal-email"
                className="text-sm font-bold text-[#2a3723]"
              >
                Email
              </label>
              <input
                id="portal-email"
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="you@example.com"
                className="rounded-md border border-[#b9bba8] px-4 py-3 outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
              />
              <label
                htmlFor="portal-password"
                className="text-sm font-bold text-[#2a3723]"
              >
                Password
              </label>
              <input
                id="portal-password"
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder="Enter password"
                className="rounded-md border border-[#b9bba8] px-4 py-3 outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
              />
              {authError && (
                <p className="text-sm font-medium text-red-700">{authError}</p>
              )}
              {authSuccess && (
                <p className="text-sm font-medium text-green-700">
                  {authSuccess}
                </p>
              )}

              {authMode === "signup" && (
                <>
                  <label
                    htmlFor="signup-role"
                    className="text-sm font-bold text-[#2a3723]"
                  >
                    I am signing up as
                  </label>
                  <select
                    id="signup-role"
                    value={signupRole}
                    onChange={(event) => setSignupRole(event.target.value)}
                    disabled={isSignupRoleLocked}
                    aria-describedby={isSignupRoleLocked ? "signup-role-note" : undefined}
                    className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2 disabled:cursor-not-allowed disabled:bg-[#f1f0eb] disabled:text-[#2a3723] disabled:opacity-100"
                  >
                    {isSignupRoleLocked ? (
                      <option value={signupRole}>
                        {signupRole === "mentor" ? "Volunteer" : "Caregiver"}
                      </option>
                    ) : (
                      <>
                        <option value="mentee">Caregiver</option>
                        <option value="mentor">Volunteer</option>
                      </>
                    )}
                  </select>
                  {isSignupRoleLocked && (
                    <p id="signup-role-note" className="-mt-1 text-xs text-[#666b60]">
                      This account type was selected on the previous page.
                    </p>
                  )}

                  <label
                    htmlFor="signup-username"
                    className="text-sm font-bold text-[#2a3723]"
                  >
                    Username
                  </label>
                  <input
                    id="signup-username"
                    type="text"
                    value={signupUsername}
                    onChange={(event) => setSignupUsername(event.target.value)}
                    placeholder="letters_numbers_only"
                    minLength={3}
                    maxLength={30}
                    pattern="[A-Za-z0-9_]+"
                    required
                    className="rounded-md border border-[#b9bba8] px-4 py-3 outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                  />

                  <label
                    htmlFor="signup-full-name"
                    className="text-sm font-bold text-[#2a3723]"
                  >
                    Full name
                  </label>
                  <input
                    id="signup-full-name"
                    type="text"
                    value={signupFullName}
                    onChange={(event) => setSignupFullName(event.target.value)}
                    placeholder="Your full name"
                    className="rounded-md border border-[#b9bba8] px-4 py-3 outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                  />

                  <label
                    htmlFor="signup-university"
                    className="text-sm font-bold text-[#2a3723]"
                  >
                    Ontario university
                  </label>
                  <select
                    id="signup-university"
                    value={signupUniversity}
                    onChange={(event) => setSignupUniversity(event.target.value)}
                    required
                    className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                  >
                    <option value="">Select your university</option>
                    {ONTARIO_UNIVERSITIES.map((university) => (
                      <option key={university} value={university}>
                        {university}
                      </option>
                    ))}
                  </select>

                  <label
                    htmlFor="signup-bio"
                    className="text-sm font-bold text-[#2a3723]"
                  >
                    Short bio
                  </label>
                  <textarea
                    id="signup-bio"
                    value={signupBio}
                    onChange={(event) => setSignupBio(event.target.value)}
                    rows={3}
                    placeholder="Tell us about yourself..."
                    className="resize-y rounded-md border border-[#b9bba8] px-4 py-3 outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                  />

                  {signupRole === "mentor" && (
                    <>
                      <label
                        htmlFor="signup-mentor-mode"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Support format
                      </label>
                      <select
                        id="signup-mentor-mode"
                        value={signupMentorMode}
                        onChange={(event) =>
                          setSignupMentorMode(event.target.value)
                        }
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="Remote">Remote</option>
                        <option value="In person">In person</option>
                        <option value="Hybrid">Hybrid</option>
                      </select>
                      <label
                        htmlFor="signup-availability"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Availability
                      </label>
                      <input
                        id="signup-availability"
                        type="text"
                        value={signupAvailability}
                        onChange={(event) =>
                          setSignupAvailability(event.target.value)
                        }
                        placeholder="Weekday evenings"
                        className="rounded-md border border-[#b9bba8] px-4 py-3 outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                    </>
                  )}

                  {signupRole === "mentee" && (
                    <>
                      <label
                        htmlFor="signup-goals"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Goals
                      </label>
                      <textarea
                        id="signup-goals"
                        value={signupGoals}
                        onChange={(event) => setSignupGoals(event.target.value)}
                        rows={2}
                        placeholder="What support are you looking for?"
                        className="resize-y rounded-md border border-[#b9bba8] px-4 py-3 outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                      <label
                        htmlFor="signup-interests"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Interests (comma-separated)
                      </label>
                      <input
                        id="signup-interests"
                        type="text"
                        value={signupInterests}
                        onChange={(event) =>
                          setSignupInterests(event.target.value)
                        }
                        placeholder="Burnout prevention, Hospital navigation"
                        className="rounded-md border border-[#b9bba8] px-4 py-3 outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                    </>
                  )}
                </>
              )}
              <button
                type="submit"
                disabled={isAuthLoading}
                className="mt-2 inline-flex w-fit items-center rounded-md bg-[#2a3723] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1f2b1b]"
              >
                {isAuthLoading
                  ? "Please wait..."
                  : authMode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setAuthMode((currentMode) => {
                    setAuthError("");
                    setAuthSuccess("");
                    return currentMode === "signup" ? "signin" : "signup";
                  })
                }
                className="w-fit text-sm font-semibold text-[#2a3723] underline"
              >
                {authMode === "signup"
                  ? "Already have an account? Sign in"
                  : "Need an account? Sign up"}
              </button>
            </form>
          </section>
        )}

        {isUnlocked && !isMatchSent && (
          <>
            {!isProfileLoading && profileError && (
              <section className="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-red-900">
                  Something went wrong
                </h3>
                <p className="mt-2 text-sm text-red-800">{profileError}</p>
                <p className="mt-2 text-sm text-red-800">
                  Please retry. If the problem continues, sign out and sign in
                  again.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 rounded-md bg-red-700 px-5 py-2 text-sm font-bold text-white hover:bg-red-800"
                >
                  Retry connection
                </button>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="ml-3 mt-4 rounded-md border border-red-300 px-5 py-2 text-sm font-bold text-red-800 hover:bg-red-100"
                >
                  Sign out
                </button>
              </section>
            )}

            {!isProfileLoading && !profileError && isAwaitingApproval && (
              <section className="rounded-lg border border-[#b9bba8] bg-white p-6 shadow-sm">
                <p className="text-sm font-bold uppercase tracking-[0.08em] text-[#2a3723]">
                  Account pending
                </p>
                <h3 className="mt-2 text-2xl font-bold text-[#0c0a08]">
                  Your {userRole === "mentor" ? "volunteer" : "caregiver"} profile is waiting for admin approval.
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-[#59604f]">
                  You can update your profile and university from Settings,
                  but matching, requests, and volunteer-hour tools stay
                  locked until an admin approves this account.
                </p>
              </section>
            )}

            {!isProfileLoading && !profileError && isApprovedMentor && (
              <nav className="workspace-tabs" aria-label="Volunteer workspace">
                <div className="inline-flex p-1">
                  <button
                    type="button"
                    onClick={() => setMentorViewMode("requests")}
                    className={`rounded-md px-4 py-2 text-sm font-semibold ${
                      mentorViewMode === "requests"
                        ? "bg-[#2a3723] text-white shadow-sm"
                        : "text-[#2a3723] hover:bg-white/60"
                    }`}
                  >
                    Caregiver requests
                  </button>
                  <button
                    type="button"
                    onClick={() => setMentorViewMode("mentees")}
                    className={`rounded-md px-4 py-2 text-sm font-semibold ${
                      mentorViewMode === "mentees"
                        ? "bg-[#2a3723] text-white shadow-sm"
                        : "text-[#2a3723] hover:bg-white/60"
                    }`}
                  >
                    My caregivers
                  </button>
                </div>
              </nav>
            )}

            {!isProfileLoading && !profileError && showMentorRequests && (
              <section className="portal-section">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="workspace-heading text-2xl font-bold text-[#0c0a08]">
                    Caregiver requests
                  </h3>
                </div>

                {isLoadingMentorRequests && (
                  <p className="mt-4 text-sm text-[#59604f]">
                    Loading requests...
                  </p>
                )}
                {mentorRequestsError && (
                  <p className="mt-4 text-sm font-medium text-red-700">
                    {mentorRequestsError}
                  </p>
                )}
                {mentorDecisionError && (
                  <p className="mt-4 text-sm font-medium text-red-700">
                    {mentorDecisionError}
                  </p>
                )}
                {mentorDecisionSuccess && (
                  <p className="mt-4 text-sm font-medium text-green-700">
                    {mentorDecisionSuccess}
                  </p>
                )}
                {!isLoadingMentorRequests && mentorRequests.length === 0 && (
                  <article className="mt-4 rounded-lg border border-dashed border-[#b9bba8] bg-white p-4">
                    <p className="text-sm text-[#59604f]">No requests yet.</p>
                  </article>
                )}
                <div className="mt-4 space-y-3">
                  {mentorRequests.map((request) => (
                    <article
                      key={request.id}
                      className="request-record rounded-lg border border-[#d3d1c8] bg-white"
                    >
                      <header className="request-record-header flex flex-wrap items-start justify-between gap-4 border-b border-[#d3d1c8] px-6 py-5">
                        <div>
                          <p className="text-xl font-extrabold text-[#0c0a08]">
                            {request.mentee_profile?.full_name || "Unnamed caregiver"}
                          </p>
                          <p className="mt-1 text-sm text-[#59604f]">
                            Submitted {new Date(request.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span className={`request-status request-status-${request.status}`}>
                          {request.status}
                        </span>
                      </header>

                      <div className="grid gap-0 md:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.8fr)]">
                        <div className="px-6 py-6 md:border-r md:border-[#d3d1c8]">
                          <p className="request-label">Support requested</p>
                          <p className="mt-2 text-lg font-bold leading-7 text-[#0c0a08]">
                            {request.care_type || "Not specified"}
                          </p>

                          <p className="request-label mt-7">About the caregiver</p>
                          <p className="mt-2 text-sm font-semibold text-[#2a3723]">
                            {formatUniversity(
                              request.mentee_profile?.university,
                            )}
                          </p>
                          <p className="mt-2 max-w-3xl text-base leading-7 text-[#41473b]">
                            {request.mentee_profile?.bio || "No bio provided."}
                          </p>
                        </div>

                        <aside className="bg-[#f5f3ed] px-6 py-6">
                          <p className="request-label">Contact</p>
                          <p className="mt-2 break-all text-base font-semibold text-[#0c0a08]">
                            {request.mentee_email || "No email available"}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[#59604f]">
                            Contact details are available after approval for arranging the first meeting.
                          </p>
                        </aside>
                      </div>

                      <footer className="flex flex-wrap items-center gap-3 border-t border-[#d3d1c8] px-6 py-5">
                        {request.status === "pending" ? (
                          <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMentorDecision(request.id, "accept")
                                  }
                                  disabled={mentorDecisionLoadingId === request.id}
                                  className="rounded-md bg-[#0c0a08] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white transition enabled:hover:bg-[#1f2b1b] disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {mentorDecisionLoadingId === request.id
                                    ? "Saving..."
                                    : "Accept request"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMentorDecision(request.id, "reject")
                                  }
                                  disabled={mentorDecisionLoadingId === request.id}
                                  className="rounded-md bg-[#fff2f2] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#9b2c2c] transition enabled:hover:bg-[#ffe3e3] disabled:cursor-not-allowed disabled:bg-slate-200"
                                >
                                  Decline request
                                </button>
                          </>
                        ) : request.status === "active" ? (
                          <p className="text-sm font-semibold text-green-700">
                            This caregiver is an active match.
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-[#59604f]">
                            This request is closed.
                          </p>
                        )}
                      </footer>
                    </article>
                  ))}
                </div>

              </section>
            )}

            {!isProfileLoading && !profileError && showMentorMentees && (
              <section className="portal-section">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="workspace-heading text-2xl font-bold text-[#0c0a08]">
                    My caregivers
                  </h3>
                </div>

                <section className="mt-5 border-t border-[#d3d1c8] pt-5">
                  <h4 className="text-base font-bold text-[#0c0a08]">
                    Active caregiver connections
                  </h4>
                  <p className="mt-1 text-sm text-[#59604f]">
                    After accepting a request, use this roster for contact and
                    volunteer-hour logging.
                  </p>
                  {activeMenteeConnections.length === 0 ? (
                    <p className="mt-3 text-sm text-[#59604f]">
                      No active caregiver connections yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {activeMenteeConnections.map((request) => (
                        <article
                          key={`active-${request.id}`}
                          className="border-b border-[#d3d1c8] py-4 text-sm text-[#41473b] last:border-b-0"
                        >
                          <p className="font-bold text-[#0c0a08]">
                            {request.mentee_profile?.full_name ||
                              "Unnamed caregiver"}
                          </p>
                          <p>
                            <span className="font-bold">Email:</span>{" "}
                            {request.mentee_email || "No email available"}
                          </p>
                          <p>
                            <span className="font-bold">University:</span>{" "}
                            {formatUniversity(
                              request.mentee_profile?.university,
                            )}
                          </p>
                          <p>
                            <span className="font-bold">Match ID:</span>{" "}
                            {request.id}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="mt-8 border-t border-[#d3d1c8] pt-6">
                  <h4 className="text-base font-bold text-[#0c0a08]">
                    Volunteer hours and meetings
                  </h4>
                  <p className="mt-1 text-sm text-[#59604f]">
                    Log each session with date, hours, next meeting, and topics
                    discussed.
                  </p>
                  <p className="mt-2 text-sm font-bold text-[#2a3723]">
                    Total logged hours: {mentorHoursTotal}
                  </p>
                  {mentorHoursError && (
                    <p className="mt-2 text-sm font-medium text-red-700">
                      {mentorHoursError}
                    </p>
                  )}
                  {mentorHoursSuccess && (
                    <p className="mt-2 text-sm font-medium text-green-700">
                      {mentorHoursSuccess}
                    </p>
                  )}

                  <form
                    onSubmit={handleLogMentorHours}
                    className="mt-3 grid gap-3 md:grid-cols-2"
                  >
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-match"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Active caregiver
                      </label>
                      <select
                        id="mentor-hours-match"
                        value={mentorHoursForm.matchId}
                        onChange={(event) =>
                          setMentorHoursForm((current) => ({
                            ...current,
                            matchId: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="">Select active match</option>
                        {activeMenteeConnections.map((request) => (
                          <option key={`hours-${request.id}`} value={request.id}>
                            {(request.mentee_profile?.full_name ||
                              "Unnamed caregiver") + ` (Match ${request.id})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-date"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Meeting date
                      </label>
                      <input
                        id="mentor-hours-date"
                        type="date"
                        value={mentorHoursForm.meetingDate}
                        onChange={(event) =>
                          setMentorHoursForm((current) => ({
                            ...current,
                            meetingDate: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-hours"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Hours
                      </label>
                      <input
                        id="mentor-hours-hours"
                        type="number"
                        step="0.25"
                        min="0"
                        value={mentorHoursForm.hours}
                        onChange={(event) =>
                          setMentorHoursForm((current) => ({
                            ...current,
                            hours: event.target.value,
                          }))
                        }
                        placeholder="1.5"
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-next-meeting"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Next meeting
                      </label>
                      <input
                        id="mentor-hours-next-meeting"
                        type="datetime-local"
                        value={mentorHoursForm.nextMeeting}
                        onChange={(event) =>
                          setMentorHoursForm((current) => ({
                            ...current,
                            nextMeeting: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-topics"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Topics discussed
                      </label>
                      <textarea
                        id="mentor-hours-topics"
                        rows={3}
                        value={mentorHoursForm.topicsDiscussed}
                        onChange={(event) =>
                          setMentorHoursForm((current) => ({
                            ...current,
                            topicsDiscussed: event.target.value,
                          }))
                        }
                        placeholder="Discussed caregiving stress and planned weekly check-ins."
                        className="resize-y rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-flags"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Anything to flag
                      </label>
                      <textarea
                        id="mentor-hours-flags"
                        rows={2}
                        value={mentorHoursForm.anythingToFlag}
                        onChange={(event) =>
                          setMentorHoursForm((current) => ({
                            ...current,
                            anythingToFlag: event.target.value,
                          }))
                        }
                        placeholder="Optional concerns or follow-up items for the admin."
                        className="resize-y rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        disabled={
                          isMentorHoursSaving || activeMenteeConnections.length === 0
                        }
                        className="rounded-md bg-[#0c0a08] px-5 py-3 text-sm font-bold text-white transition enabled:hover:bg-[#1f2b1b] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {isMentorHoursSaving ? "Saving..." : "Log volunteer hours"}
                      </button>
                    </div>
                  </form>

                  {isMentorHoursLoading ? (
                    <p className="mt-3 text-sm text-[#59604f]">
                      Loading volunteer logs...
                    </p>
                  ) : mentorHoursEntries.length === 0 ? (
                    <p className="mt-3 text-sm text-[#59604f]">
                      No volunteer sessions logged yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {mentorHoursEntries.slice(0, 5).map((entry) => (
                        <article
                          key={`hour-entry-${entry.id}`}
                          className="border-b border-[#d3d1c8] py-4 text-sm text-[#41473b] last:border-b-0"
                        >
                          <p className="font-bold text-[#0c0a08]">
                            {new Date(entry.meeting_date).toLocaleDateString()} -{" "}
                            {entry.hours} hours
                          </p>
                          <p>
                            <span className="font-bold">Topics:</span>{" "}
                            {entry.topics_discussed}
                          </p>
                          {entry.anything_to_flag && (
                            <p className="mt-1 text-[#8f2525]">
                              <span className="font-bold">Flag:</span>{" "}
                              {entry.anything_to_flag}
                            </p>
                          )}
                          <p>
                            <span className="font-bold">Next meeting:</span>{" "}
                            {entry.next_meeting
                              ? new Date(entry.next_meeting).toLocaleString()
                              : "Not set"}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </section>
            )}

            {!isProfileLoading &&
              !profileError &&
              !isAdmin &&
              !isMentee &&
              !isMentor && (
                <section className="rounded-lg border border-[#b9bba8] bg-white p-6 shadow-sm">
                  <h3 className="text-2xl font-bold text-[#0c0a08]">
                    Account loaded
                  </h3>
                  <p className="mt-2 text-sm text-[#59604f]">
                    We could not determine a supported role for this account
                    yet.
                  </p>
                  <p className="mt-2 text-sm text-[#59604f]">
                    Current role:{" "}
                    <span className="font-bold">
                      {userRole || "unassigned"}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-[#59604f]">
                    Approval status:{" "}
                    <span className="font-bold">
                      {profileData?.profile?.approval_status ?? "unknown"}
                    </span>
                  </p>
                </section>
              )}

            {isAdmin && (
              <nav className="workspace-tabs" aria-label="Admin workspace">
                <div className="inline-flex p-1">
                  <button
                    type="button"
                    onClick={() => setAdminViewMode("admin")}
                    className={`rounded-md px-4 py-2 text-sm font-bold ${
                      adminViewMode === "admin"
                        ? "bg-[#2a3723] text-white shadow-sm"
                        : "text-[#2a3723] hover:bg-white/60"
                    }`}
                  >
                    Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminViewMode("mentee")}
                    className={`rounded-md px-4 py-2 text-sm font-bold ${
                      adminViewMode === "mentee"
                        ? "bg-[#2a3723] text-white shadow-sm"
                        : "text-[#2a3723] hover:bg-white/60"
                    }`}
                  >
                    Caregiver experience
                  </button>
                </div>
              </nav>
            )}

            {showAdminDashboard && (
              <section className="admin-dashboard">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d3d1c8] pb-7">
                  <div>
                    <h3 className="workspace-heading text-2xl font-bold text-[#0c0a08]">
                      Admin dashboard
                    </h3>
                    <p className="mt-1 text-sm text-[#59604f]">
                      {isSuperAdmin
                        ? "Super-admin workspace across all Ontario universities."
                        : `${formatUniversity(profileData?.profile?.university)} workspace. Review applications and monitor active support.`}
                    </p>
                  </div>
                </div>

                {!hasAdminUniversityScope && (
                  <section className="mt-8 rounded-lg border border-[#d4bd92] bg-[#f5ecdf] p-6">
                    <h4 className="text-xl font-extrabold text-[#0c0a08]">
                      University assignment required
                    </h4>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#59604f]">
                      This admin account cannot access applications or member
                      records until the super-admin assigns it an Ontario
                      university.
                    </p>
                  </section>
                )}

                {hasAdminUniversityScope && (
                  <>
                {isAdminLoading && (
                  <p className="mt-4 text-sm text-[#59604f]">
                    Loading admin dashboard...
                  </p>
                )}
                {adminError && (
                  <p className="mt-4 text-sm font-medium text-red-700">
                    {adminError}
                  </p>
                )}
                {adminSuccess && (
                  <p className="mt-4 text-sm font-medium text-green-700">
                    {adminSuccess}
                  </p>
                )}

                {adminMetrics && (
                  <div className="admin-metrics mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <article className="rounded-lg border border-[#d3d1c8] bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold text-[#59604f]">
                        Active volunteers
                      </p>
                      <p className="mt-2 text-3xl font-bold text-[#0c0a08]">
                        {adminMetrics.active_mentors}
                      </p>
                    </article>
                    <article className="rounded-lg border border-[#d3d1c8] bg-[#f0f1eb] p-5 shadow-sm">
                      <p className="text-xs font-semibold text-[#59604f]">
                        Active caregivers
                      </p>
                      <p className="mt-2 text-3xl font-bold text-[#0c0a08]">
                        {adminMetrics.active_mentees}
                      </p>
                    </article>
                    <article className="rounded-lg border border-[#d3d1c8] bg-[#f5ecdf] p-5 shadow-sm">
                      <p className="text-xs font-semibold text-[#59604f]">
                        Current matches
                      </p>
                      <p className="mt-2 text-3xl font-bold text-[#0c0a08]">
                        {adminMetrics.current_matches}
                      </p>
                    </article>
                    <article className="rounded-lg border border-[#d3d1c8] bg-[#e7eadf] p-5 shadow-sm">
                      <p className="text-xs font-semibold text-[#59604f]">
                        Volunteer hours
                      </p>
                      <p className="mt-2 text-3xl font-bold text-[#0c0a08]">
                        {adminMetrics.volunteer_hours_total}
                      </p>
                    </article>
                  </div>
                )}

                <section className="admin-section mt-10 border-t border-[#d3d1c8] pt-9">
                  <div>
                    <h4 className="text-2xl font-extrabold text-[#0c0a08]">
                      Preapproved signup emails
                    </h4>
                    <p className="mt-2 text-base text-[#59604f]">
                      People who sign up with an email below are approved for
                      the selected role and university automatically.
                    </p>
                  </div>
                  <form
                    className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr_1.4fr_auto] lg:items-end"
                    onSubmit={handleCreatePreapprovedEmail}
                  >
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                      Email
                      <input
                        type="email"
                        required
                        value={adminInviteForm.email}
                        onChange={(event) =>
                          setAdminInviteForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        placeholder="person@example.com"
                        className="rounded-md border border-[#b9bba8] bg-white px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                      Account type
                      <select
                        value={adminInviteForm.role}
                        onChange={(event) =>
                          setAdminInviteForm((current) => ({
                            ...current,
                            role: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] bg-white px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="mentor">Volunteer</option>
                        <option value="mentee">Caregiver</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                      University
                      <select
                        required
                        disabled={!isSuperAdmin}
                        value={adminInviteForm.university}
                        onChange={(event) =>
                          setAdminInviteForm((current) => ({
                            ...current,
                            university: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] bg-white px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] disabled:bg-[#f0f1eb] focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="">Select university</option>
                        {ONTARIO_UNIVERSITIES.map((university) => (
                          <option key={`invite-${university}`} value={university}>
                            {university}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={isAdminInviteSaving}
                      className="rounded-md bg-[#2a3723] px-5 py-3 text-sm font-bold text-white enabled:hover:bg-[#1f2b1b] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAdminInviteSaving ? "Adding..." : "Preapprove"}
                    </button>
                  </form>

                  {adminPreapprovedEmails.length === 0 ? (
                    <p className="mt-5 border-y border-[#d3d1c8] py-4 text-sm text-[#59604f]">
                      No preapproved emails yet.
                    </p>
                  ) : (
                    <div className="mt-6 divide-y divide-[#d3d1c8] border-y border-[#d3d1c8]">
                      {adminPreapprovedEmails.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-wrap items-center justify-between gap-4 py-4"
                        >
                          <div>
                            <p className="font-bold text-[#0c0a08]">{entry.email}</p>
                            <p className="mt-1 text-sm text-[#59604f]">
                              {entry.role === "mentor" ? "Volunteer" : "Caregiver"} · {formatUniversity(entry.university)} · {entry.claimed_at ? "Account created" : "Waiting for signup"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePreapprovedEmail(entry.id)}
                            className="rounded-md border border-[#c98484] px-3 py-2 text-sm font-bold text-[#8f2525] hover:bg-[#fff2f2]"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="admin-section mt-10 border-t border-[#d3d1c8] pt-9">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h4 className="text-2xl font-extrabold text-[#0c0a08]">
                        Profile management
                      </h4>
                      <p className="mt-2 text-base text-[#59604f]">
                        Create accounts or edit any profile in your admin scope.
                      </p>
                    </div>
                    {adminEditingUserId && (
                      <button
                        type="button"
                        onClick={resetAdminProfileForm}
                        className="rounded-md border border-[#b9bba8] px-4 py-2 text-sm font-bold text-[#2a3723] hover:bg-[#f0f1eb]"
                      >
                        Cancel editing
                      </button>
                    )}
                  </div>

                  <form
                    className="mt-6 grid gap-5 border-y border-[#d3d1c8] py-6 md:grid-cols-2"
                    onSubmit={handleSaveAdminProfile}
                  >
                    {!adminEditingUserId && (
                      <>
                        <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                          Login email
                          <input
                            type="email"
                            required
                            value={adminProfileForm.email}
                            onChange={(event) =>
                              setAdminProfileForm((current) => ({
                                ...current,
                                email: event.target.value,
                              }))
                            }
                            className="rounded-md border border-[#b9bba8] px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                          Temporary password
                          <input
                            type="password"
                            minLength={8}
                            required
                            value={adminProfileForm.password}
                            onChange={(event) =>
                              setAdminProfileForm((current) => ({
                                ...current,
                                password: event.target.value,
                              }))
                            }
                            className="rounded-md border border-[#b9bba8] px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                          />
                        </label>
                      </>
                    )}
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                      Role
                      <select
                        disabled={Boolean(adminEditingUser?.is_super_admin)}
                        value={adminProfileForm.role}
                        onChange={(event) =>
                          setAdminProfileForm((current) => ({
                            ...current,
                            role: event.target.value,
                            approvalStatus:
                              event.target.value === "admin"
                                ? "approved"
                                : current.approvalStatus,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] bg-white px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] disabled:bg-[#f0f1eb] focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="mentor">Volunteer</option>
                        <option value="mentee">Caregiver</option>
                        {isSuperAdmin && <option value="admin">Admin</option>}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                      Approval status
                      <select
                        disabled={adminProfileForm.role === "admin"}
                        value={adminProfileForm.approvalStatus}
                        onChange={(event) =>
                          setAdminProfileForm((current) => ({
                            ...current,
                            approvalStatus: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] bg-white px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] disabled:bg-[#f0f1eb] focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                      Username
                      <input
                        required
                        minLength={3}
                        maxLength={30}
                        pattern="[A-Za-z0-9_]+"
                        value={adminProfileForm.username}
                        onChange={(event) =>
                          setAdminProfileForm((current) => ({
                            ...current,
                            username: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                      Full name
                      <input
                        required
                        value={adminProfileForm.fullName}
                        onChange={(event) =>
                          setAdminProfileForm((current) => ({
                            ...current,
                            fullName: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                      University
                      <select
                        required
                        disabled={!isSuperAdmin}
                        value={adminProfileForm.university}
                        onChange={(event) =>
                          setAdminProfileForm((current) => ({
                            ...current,
                            university: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] bg-white px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] disabled:bg-[#f0f1eb] focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="">Select university</option>
                        {ONTARIO_UNIVERSITIES.map((university) => (
                          <option key={`managed-${university}`} value={university}>
                            {university}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-[#2a3723] md:col-span-2">
                      Bio
                      <textarea
                        rows={3}
                        value={adminProfileForm.bio}
                        onChange={(event) =>
                          setAdminProfileForm((current) => ({
                            ...current,
                            bio: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[#b9bba8] px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                      />
                    </label>

                    {adminProfileForm.role === "mentor" && (
                      <>
                        <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                          Support format
                          <select
                            value={adminProfileForm.mentorMode}
                            onChange={(event) =>
                              setAdminProfileForm((current) => ({
                                ...current,
                                mentorMode: event.target.value,
                              }))
                            }
                            className="rounded-md border border-[#b9bba8] bg-white px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                          >
                            <option value="Remote">Remote</option>
                            <option value="In person">In person</option>
                            <option value="Hybrid">Hybrid</option>
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                          Availability
                          <input
                            value={adminProfileForm.availability}
                            onChange={(event) =>
                              setAdminProfileForm((current) => ({
                                ...current,
                                availability: event.target.value,
                              }))
                            }
                            placeholder="Weekday evenings"
                            className="rounded-md border border-[#b9bba8] px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                          />
                        </label>
                        <label className="flex items-center gap-3 text-sm font-bold text-[#2a3723]">
                          <input
                            type="checkbox"
                            checked={adminProfileForm.isVisible}
                            onChange={(event) =>
                              setAdminProfileForm((current) => ({
                                ...current,
                                isVisible: event.target.checked,
                              }))
                            }
                          />
                          Accepting new matches
                        </label>
                        <label className="flex items-center gap-3 text-sm font-bold text-[#2a3723]">
                          <input
                            type="checkbox"
                            checked={adminProfileForm.sameUniversityOnly}
                            onChange={(event) =>
                              setAdminProfileForm((current) => ({
                                ...current,
                                sameUniversityOnly: event.target.checked,
                              }))
                            }
                          />
                          Only visible to caregivers at this university
                        </label>
                      </>
                    )}

                    {adminProfileForm.role === "mentee" && (
                      <>
                        <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                          Support goals
                          <textarea
                            rows={3}
                            value={adminProfileForm.goals}
                            onChange={(event) =>
                              setAdminProfileForm((current) => ({
                                ...current,
                                goals: event.target.value,
                              }))
                            }
                            className="rounded-md border border-[#b9bba8] px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-bold text-[#2a3723]">
                          Interests
                          <textarea
                            rows={3}
                            value={adminProfileForm.interests}
                            onChange={(event) =>
                              setAdminProfileForm((current) => ({
                                ...current,
                                interests: event.target.value,
                              }))
                            }
                            placeholder="Comma-separated"
                            className="rounded-md border border-[#b9bba8] px-4 py-3 font-normal text-[#0c0a08] outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                          />
                        </label>
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={isAdminProfileSaving}
                      className="w-fit rounded-md bg-[#0c0a08] px-5 py-3 text-sm font-bold text-white enabled:hover:bg-[#2a3723] disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
                    >
                      {isAdminProfileSaving
                        ? "Saving..."
                        : adminEditingUserId
                          ? "Save profile changes"
                          : "Create account"}
                    </button>
                  </form>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#b9bba8] text-xs font-bold uppercase text-[#2a3723]">
                          <th className="px-3 py-3">Name</th>
                          <th className="px-3 py-3">Role</th>
                          <th className="px-3 py-3">University</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((user) => (
                          <tr key={`managed-${user.id}`} className="border-b border-[#dfddd5]">
                            <td className="px-3 py-4 font-bold text-[#0c0a08]">
                              {user.full_name || "Unnamed profile"}
                              {user.is_super_admin && (
                                <span className="ml-2 rounded bg-[#dfe2d5] px-2 py-1 text-xs text-[#2a3723]">
                                  Super-admin
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-4 capitalize text-[#41473b]">{user.role}</td>
                            <td className="px-3 py-4 text-[#41473b]">{formatUniversity(user.university)}</td>
                            <td className="px-3 py-4 text-[#41473b]">{user.approval_status}</td>
                            <td className="px-3 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => startEditingAdminUser(user)}
                                className="rounded-md border border-[#b9bba8] px-3 py-2 font-bold text-[#2a3723] hover:bg-[#f0f1eb]"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="admin-section mt-10 border-t border-[#d3d1c8] pt-9">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h4 className="text-2xl font-extrabold text-[#0c0a08]">
                        All matches
                      </h4>
                      <p className="mt-2 text-base text-[#59604f]">
                        Every volunteer and caregiver match, including pending and closed requests.
                      </p>
                    </div>
                    <label className="flex items-center gap-3 text-sm font-bold text-[#2a3723]">
                      Status
                      <select
                        value={adminMatchStatusFilter}
                        onChange={(event) =>
                          setAdminMatchStatusFilter(event.target.value)
                        }
                        className="rounded-md border border-[#b9bba8] bg-white px-3 py-2 text-sm outline-none ring-[#9ca48f] focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="active">Active</option>
                        <option value="declined">Declined</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>
                  </div>

                  {filteredAdminMatches.length === 0 ? (
                    <p className="mt-5 rounded-md border border-dashed border-[#b9bba8] p-4 text-sm text-[#59604f]">
                      No matches have this status.
                    </p>
                  ) : (
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#b9bba8] text-xs font-bold uppercase tracking-[0.08em] text-[#2a3723]">
                            <th className="px-3 py-3">Volunteer</th>
                            <th className="px-3 py-3">Caregiver</th>
                            <th className="px-3 py-3">Support requested</th>
                            <th className="px-3 py-3">Status</th>
                            <th className="px-3 py-3">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAdminMatches.map((match) => (
                            <tr key={match.id} className="border-b border-[#dfddd5] text-[#41473b]">
                              <td className="px-3 py-4 font-bold text-[#0c0a08]">
                                <p>{match.volunteer_profile?.full_name || "Unknown volunteer"}</p>
                                <p className="mt-1 text-xs font-normal text-[#59604f]">
                                  {formatUniversity(
                                    match.volunteer_profile?.university,
                                  )}
                                </p>
                              </td>
                              <td className="px-3 py-4 font-bold text-[#0c0a08]">
                                <p>{match.caregiver_profile?.full_name || "Unknown caregiver"}</p>
                                <p className="mt-1 text-xs font-normal text-[#59604f]">
                                  {formatUniversity(
                                    match.caregiver_profile?.university,
                                  )}
                                </p>
                              </td>
                              <td className="max-w-sm px-3 py-4">
                                {match.care_type || "Not specified"}
                              </td>
                              <td className="px-3 py-4">
                                <span className={`request-status request-status-${match.status}`}>
                                  {match.status}
                                </span>
                              </td>
                              <td className="px-3 py-4">
                                {match.created_at
                                  ? new Date(match.created_at).toLocaleDateString()
                                  : "Unknown"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="admin-section mt-10 border-t border-[#d3d1c8] pt-9">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                    <h4 className="text-2xl font-extrabold text-[#0c0a08]">
                      Volunteer-Caregiver session logs
                    </h4>
                    <p className="mt-2 text-base text-[#59604f]">
                      Full session details across all volunteers and caregivers.
                    </p>
                    </div>
                    <p className="rounded-md bg-[#dfe2d5] px-4 py-2 text-sm font-bold text-[#2a3723]">
                      {adminSessionsTotal} total hours
                    </p>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <label
                      htmlFor="admin-session-mentor-filter"
                      className="text-xs font-bold uppercase tracking-[0.08em] text-[#2a3723]"
                    >
                      Filter by volunteer
                    </label>
                    <select
                      id="admin-session-mentor-filter"
                      value={adminSessionMentorFilter}
                      onChange={(event) =>
                        setAdminSessionMentorFilter(event.target.value)
                      }
                      className="rounded-md border border-[#b9bba8] bg-white px-3 py-2 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                    >
                      <option value="all">All volunteers</option>
                      {adminSessionMentorOptions.map((mentorName) => (
                        <option key={mentorName} value={mentorName}>
                          {mentorName}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isAdminLoading ? (
                    <p className="mt-3 text-sm text-[#59604f]">
                      Loading session logs...
                    </p>
                  ) : filteredAdminSessionEntries.length === 0 ? (
                    <p className="mt-3 text-sm text-[#59604f]">
                      No session logs match the selected volunteer.
                    </p>
                  ) : (
                    <div className="mt-6 divide-y divide-[#d3d1c8] border-y border-[#d3d1c8]">
                      {filteredAdminSessionEntries.slice(0, 20).map((entry) => (
                        <article
                          key={`admin-session-${entry.id}`}
                          className="grid gap-5 py-5 text-sm text-[#41473b] md:grid-cols-[150px_1fr_1fr]"
                        >
                          <div>
                            <p className="request-label">Session</p>
                            <p className="mt-2 font-bold text-[#0c0a08]">
                              {new Date(entry.meeting_date).toLocaleDateString()}
                            </p>
                            <p className="mt-1 text-lg font-extrabold text-[#2a3723]">{entry.hours} hours</p>
                          </div>
                          <div>
                            <p className="request-label">Participants</p>
                            <p className="mt-2"><span className="font-bold">Volunteer:</span> {entry.mentor_profile?.full_name || "Unknown volunteer"}</p>
                            <p className="mt-1"><span className="font-bold">Caregiver:</span> {entry.mentee_profile?.full_name || "Unknown caregiver"}</p>
                            <p className="mt-1 text-xs text-[#59604f]">Match #{entry.match_id}</p>
                          </div>
                          <div>
                            <p className="request-label">Session details</p>
                            <p className="mt-2 leading-6">{entry.topics_discussed || "No topics provided"}</p>
                            <p className={`mt-2 leading-6 ${entry.anything_to_flag ? "font-semibold text-[#8f2525]" : "text-[#59604f]"}`}>
                              <span className="font-bold">Anything to flag:</span>{" "}
                              {entry.anything_to_flag || "Nothing flagged"}
                            </p>
                            <p className="mt-2"><span className="font-bold">Next meeting:</span> {entry.next_meeting ? new Date(entry.next_meeting).toLocaleString() : "Not scheduled"}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section
                  id="program-applications"
                  className="admin-section mt-10 space-y-5 border-t border-[#d3d1c8] pt-9"
                >
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#67705f]">
                        Screening queue
                      </p>
                      <h4 className="mt-1 text-2xl font-extrabold text-[#0c0a08]">
                        Pending application submissions
                      </h4>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#59604f]">
                        Review the complete caregiver and volunteer interest
                        forms. Contact details and legal names stay private to
                        QYCC administrators.
                      </p>
                    </div>
                    <span className="rounded-full bg-[#dfe2d5] px-3 py-1 text-sm font-bold text-[#2a3723]">
                      {adminProgramApplications.length} pending
                    </span>
                  </div>

                  {adminProgramApplications.length === 0 ? (
                    <article className="rounded-lg border border-dashed border-[#b9bba8] bg-white p-4">
                      <p className="text-sm text-[#59604f]">
                        No new application submissions right now.
                      </p>
                    </article>
                  ) : (
                    <div className="space-y-5">
                      {adminProgramApplications.map((application) => (
                        <AdminProgramApplicationCard
                          key={application.id}
                          application={application}
                          isReviewing={adminActionUserId === application.id}
                          onReview={handleProgramApplicationAction}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <div className="admin-section mt-10 space-y-4 border-t border-[#d3d1c8] pt-9">
                  <h4 className="text-2xl font-extrabold text-[#0c0a08]">
                    Pending member account approvals
                  </h4>
                  <p className="text-sm text-[#59604f]">
                    Legacy account-based applications that already have a
                    Supabase Auth profile.
                  </p>
                  {adminPendingUsers.length === 0 ? (
                    <article className="rounded-lg border border-dashed border-[#b9bba8] bg-white p-4">
                      <p className="text-sm text-[#59604f]">
                        No pending requests right now.
                      </p>
                    </article>
                  ) : (
                    adminPendingUsers.map((user) => (
                      <article
                        key={user.id}
                        className="rounded-lg border border-[#d3d1c8] bg-white p-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-bold text-[#0c0a08]">
                              {user.full_name || "Unnamed user"}
                            </p>
                            <p className="text-sm text-[#59604f]">
                              {user.role === "mentor" ? "Volunteer" : "Caregiver"} application - submitted{" "}
                              {new Date(user.created_at).toLocaleDateString()}
                            </p>
                            {user.bio && (
                              <p className="mt-2 text-sm text-[#41473b]">
                                {user.bio}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleAdminRequestAction(user.id, "approve")
                              }
                              disabled={
                                adminActionUserId === user.id ||
                                !user.university ||
                                user.university === "University not selected"
                              }
                              className="rounded-md bg-[#0c0a08] px-4 py-2 text-sm font-bold text-white transition enabled:hover:bg-[#1f2b1b] disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAdminRequestAction(user.id, "reject")
                              }
                              disabled={adminActionUserId === user.id}
                              className="rounded-md bg-[#fff2f2] px-4 py-2 text-sm font-bold text-[#9b2c2c] transition enabled:hover:bg-[#ffe3e3] disabled:cursor-not-allowed disabled:bg-slate-200"
                            >
                              Reject
                            </button>
                          </div>
                        </div>

                          <div className="mt-5 grid gap-4 border-t border-[#d3d1c8] pt-5 text-sm text-[#41473b] md:grid-cols-2">
                            <p>
                              <span className="font-bold">Username:</span>{" "}
                              {user.username || "Not provided"}
                            </p>
                            <p>
                              <span className="font-bold">Role:</span>{" "}
                              {user.role === "mentor" ? "Volunteer" : "Caregiver"}
                            </p>
                            <p>
                              <span className="font-bold">University:</span>{" "}
                              {formatUniversity(user.university)}
                            </p>
                            {(!user.university ||
                              user.university === "University not selected") && (
                              <p className="font-semibold text-[#8a6500] md:col-span-2">
                                Approval is unavailable until the applicant
                                selects a university.
                              </p>
                            )}

                            {user.role === "mentor" && (
                              <>
                                <p>
                                  <span className="font-bold">
                                    Availability:
                                  </span>{" "}
                                  {(Array.isArray(user.mentor_profiles)
                                    ? user.mentor_profiles[0]?.availability
                                    : user.mentor_profiles?.availability) ||
                                    "Not provided"}
                                </p>
                              </>
                            )}

                            {user.role === "mentee" && (
                              <>
                                <p>
                                  <span className="font-bold">Goals:</span>{" "}
                                  {(Array.isArray(user.mentee_profiles)
                                    ? user.mentee_profiles[0]?.goals
                                    : user.mentee_profiles?.goals) ||
                                    "Not provided"}
                                </p>
                                <p>
                                  <span className="font-bold">Interests:</span>{" "}
                                  {(
                                    (Array.isArray(user.mentee_profiles)
                                      ? user.mentee_profiles[0]?.interests
                                      : user.mentee_profiles?.interests) ?? []
                                  ).join(", ") || "Not provided"}
                                </p>
                              </>
                            )}
                          </div>
                      </article>
                    ))
                  )}
                </div>

                <section className="admin-section mt-10 space-y-5 border-t border-[#d3d1c8] pt-9">
                  <div>
                    <h4 className="text-2xl font-extrabold text-[#0c0a08]">
                      Reviewed application submissions
                    </h4>
                    <p className="mt-2 text-sm text-[#59604f]">
                      Previously approved or rejected caregiver and volunteer
                      interest forms.
                    </p>
                  </div>
                  {adminReviewedProgramApplications.length === 0 ? (
                    <article className="rounded-lg border border-dashed border-[#b9bba8] bg-white p-4">
                      <p className="text-sm text-[#59604f]">
                        No reviewed application submissions yet.
                      </p>
                    </article>
                  ) : (
                    <div className="space-y-5">
                      {adminReviewedProgramApplications.map((application) => (
                        <AdminProgramApplicationCard
                          key={`reviewed-program-${application.id}`}
                          application={application}
                          isReviewing={false}
                          onReview={handleProgramApplicationAction}
                          reviewed
                        />
                      ))}
                    </div>
                  )}
                </section>

                <div className="admin-section mt-10 space-y-4 border-t border-[#d3d1c8] pt-9">
                  <h4 className="text-2xl font-extrabold text-[#0c0a08]">
                    Reviewed member accounts
                  </h4>
                  <p className="text-sm text-[#59604f]">
                    View previously approved/rejected requests and update their
                    status.
                  </p>
                  {adminReviewedUsers.length === 0 ? (
                    <article className="rounded-lg border border-dashed border-[#b9bba8] bg-white p-4">
                      <p className="text-sm text-[#59604f]">
                        No reviewed requests yet.
                      </p>
                    </article>
                  ) : (
                    adminReviewedUsers.map((user) => (
                      <article
                        key={`reviewed-${user.id}`}
                        className={`hover-lift rounded-lg border bg-white p-4 ${
                          adminSelectedReviewedUser?.id === user.id
                            ? "border-[#2a3723] ring-2 ring-[#b9bba8]"
                            : "border-[#d3d1c8]"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-bold text-[#0c0a08]">
                              {user.full_name || "Unnamed user"}
                            </p>
                            <p className="text-sm text-[#59604f]">
                              {user.role === "mentor" ? "Volunteer" : "Caregiver"} - {user.approval_status} - submitted{" "}
                              {new Date(user.created_at).toLocaleDateString()}
                            </p>
                            {user.bio && (
                              <p className="mt-2 text-sm text-[#41473b]">
                                {user.bio}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {user.approval_status === "approved" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAdminRequestAction(user.id, "reject")
                                }
                                disabled={adminActionUserId === user.id}
                                className="rounded-md bg-[#fff2f2] px-4 py-2 text-sm font-bold text-[#9b2c2c] transition enabled:hover:bg-[#ffe3e3] disabled:cursor-not-allowed disabled:bg-slate-200"
                              >
                                Revoke approval
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAdminRequestAction(user.id, "approve")
                                }
                                disabled={
                                  adminActionUserId === user.id ||
                                  !user.university ||
                                  user.university === "University not selected"
                                }
                                className="rounded-md bg-[#0c0a08] px-4 py-2 text-sm font-bold text-white transition enabled:hover:bg-[#1f2b1b] disabled:cursor-not-allowed disabled:bg-slate-300"
                              >
                                Approve account
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setAdminSelectedReviewedUser((current) =>
                                  current?.id === user.id ? null : user,
                                )
                              }
                              className="rounded-md bg-[#dfe2d5] px-3 py-2 text-sm font-bold text-[#2a3723] hover:bg-[#cbd0c1]"
                              aria-label={
                                adminSelectedReviewedUser?.id === user.id
                                  ? "Hide profile details"
                                  : "Show profile details"
                              }
                            >
                              {adminSelectedReviewedUser?.id === user.id
                                ? "Hide details"
                                : "View details"}
                            </button>
                          </div>
                        </div>

                        {adminSelectedReviewedUser?.id === user.id && (
                          <div className="mt-4 rounded-md bg-[#f4f2ec] p-3 text-sm text-[#41473b]">
                            <p>
                              <span className="font-bold">Name:</span>{" "}
                              {user.full_name || "Unnamed user"}
                            </p>
                            <p>
                              <span className="font-bold">Role:</span>{" "}
                              {user.role}
                            </p>
                            <p>
                              <span className="font-bold">Status:</span>{" "}
                              {user.approval_status}
                            </p>
                            <p>
                              <span className="font-bold">Submitted:</span>{" "}
                              {new Date(user.created_at).toLocaleString()}
                            </p>
                            <p>
                              <span className="font-bold">Bio:</span>{" "}
                              {user.bio || "No bio provided."}
                            </p>
                            <p>
                              <span className="font-bold">University:</span>{" "}
                              {formatUniversity(user.university)}
                            </p>

                            {user.role === "mentor" && (
                              <>
                                <p>
                                  <span className="font-bold">
                                    Availability:
                                  </span>{" "}
                                  {(Array.isArray(user.mentor_profiles)
                                    ? user.mentor_profiles[0]?.availability
                                    : user.mentor_profiles?.availability) ||
                                    "Not provided"}
                                </p>
                              </>
                            )}

                            {user.role === "mentee" && (
                              <>
                                <p>
                                  <span className="font-bold">Goals:</span>{" "}
                                  {(Array.isArray(user.mentee_profiles)
                                    ? user.mentee_profiles[0]?.goals
                                    : user.mentee_profiles?.goals) ||
                                    "Not provided"}
                                </p>
                                <p>
                                  <span className="font-bold">Interests:</span>{" "}
                                  {(
                                    (Array.isArray(user.mentee_profiles)
                                      ? user.mentee_profiles[0]?.interests
                                      : user.mentee_profiles?.interests) ?? []
                                  ).join(", ") || "Not provided"}
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>

                <div className="admin-section mt-10 border-t border-[#d3d1c8] pt-9">
                  <h4 className="text-2xl font-extrabold text-[#0c0a08]">
                    Volunteer profiles
                  </h4>
                  <p className="mt-1 text-sm text-[#59604f]">
                    Click a volunteer row to view their profile and caregiver
                    requests.
                  </p>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      {adminMentors.length === 0 ? (
                        <article className="rounded-lg border border-dashed border-[#b9bba8] bg-white p-4">
                          <p className="text-sm text-[#59604f]">
                            No approved volunteers found.
                          </p>
                        </article>
                      ) : (
                        adminMentors.map((mentor) => (
                          <button
                            key={mentor.id}
                            type="button"
                            onClick={() => loadAdminMentorDetails(mentor.id)}
                            className={`hover-lift w-full rounded-lg border bg-white p-4 text-left ${
                              adminSelectedMentor?.id === mentor.id
                                ? "border-[#2a3723] ring-2 ring-[#b9bba8]"
                                : "border-[#d3d1c8]"
                            }`}
                          >
                            <p className="text-base font-bold text-[#0c0a08]">
                              {mentor.full_name || "Unnamed volunteer"}
                            </p>
                            <p className="mt-1 text-sm text-[#59604f]">
                              Accepting new matches:{" "}
                              {mentor.is_visible ? "Yes" : "No"}
                            </p>
                            <p className="mt-1 text-sm text-[#59604f]">
                              Audience:{" "}
                              {mentor.same_university_only
                                ? "Same university only"
                                : "All Ontario universities"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#2a3723]">
                              {formatUniversity(mentor.university)}
                            </p>
                            {mentor.bio && (
                              <p className="mt-2 text-sm text-[#41473b] line-clamp-2">
                                {mentor.bio}
                              </p>
                            )}
                          </button>
                        ))
                      )}
                    </div>

                    <section className="rounded-lg border border-[#d3d1c8] bg-white p-4">
                      <h5 className="text-base font-bold text-[#0c0a08]">
                        Volunteer details
                      </h5>
                      {isLoadingAdminMentorDetails && (
                        <p className="mt-3 text-sm text-[#59604f]">
                          Loading volunteer details...
                        </p>
                      )}
                      {adminMentorDetailsError && (
                        <p className="mt-3 text-sm font-medium text-red-700">
                          {adminMentorDetailsError}
                        </p>
                      )}
                      {!isLoadingAdminMentorDetails &&
                        !adminMentorDetailsError &&
                        !adminSelectedMentor && (
                          <p className="mt-3 text-sm text-[#59604f]">
                            Select a volunteer to view their profile and requests.
                          </p>
                        )}

                      {adminSelectedMentor && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <p className="text-sm font-bold text-[#0c0a08]">
                              {adminSelectedMentor.full_name ||
                                "Unnamed volunteer"}
                            </p>
                            <p className="text-sm text-[#59604f]">
                              Status: {adminSelectedMentor.approval_status} -{" "}
                              {adminSelectedMentor.is_visible
                                ? "Accepting new matches"
                                : "Not accepting new matches"}
                            </p>
                            <p className="mt-1 text-sm text-[#59604f]">
                              Audience:{" "}
                              {adminSelectedMentor.same_university_only
                                ? "Same university only"
                                : "All Ontario universities"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#2a3723]">
                              {formatUniversity(
                                adminSelectedMentor.university,
                              )}
                            </p>
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveMentorAccess(adminSelectedMentor.id)
                              }
                              disabled={
                                adminActionUserId === adminSelectedMentor.id
                              }
                              className="rounded-md bg-[#fff2f2] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#9b2c2c] transition enabled:hover:bg-[#ffe3e3] disabled:cursor-not-allowed disabled:bg-slate-200"
                            >
                              {adminActionUserId === adminSelectedMentor.id
                                ? "Removing..."
                                : "Remove volunteer listing + access"}
                            </button>
                          </div>
                          <p className="text-sm text-[#41473b]">
                            {adminSelectedMentor.bio || "No bio provided."}
                          </p>
                          <p className="text-sm text-[#41473b]">
                            <span className="font-bold">Availability:</span>{" "}
                            {(Array.isArray(adminSelectedMentor.mentor_profiles)
                              ? adminSelectedMentor.mentor_profiles[0]
                                  ?.availability
                              : adminSelectedMentor.mentor_profiles
                                  ?.availability) || "Not set"}
                          </p>

                          <div className="pt-2">
                            <p className="text-sm font-bold text-[#0c0a08]">
                              Caregiver requests
                            </p>
                            {adminSelectedMentorRequests.length === 0 ? (
                              <p className="mt-1 text-sm text-[#59604f]">
                                No requests for this volunteer yet.
                              </p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {adminSelectedMentorRequests.map((request) => (
                                  <article
                                    key={request.id}
                                    className="rounded-md bg-[#f4f2ec] p-3"
                                  >
                                    <p className="text-sm font-bold text-[#0c0a08]">
                                      {request.mentee_profile?.full_name ||
                                        "Unnamed caregiver"}
                                    </p>
                                    <p className="text-xs text-[#59604f]">
                                      {request.status} -{" "}
                                      {new Date(
                                        request.created_at,
                                      ).toLocaleDateString()}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-[#2a3723]">
                                      {formatUniversity(
                                        request.mentee_profile?.university,
                                      )}
                                    </p>
                                    {request.mentee_profile?.bio && (
                                      <p className="mt-1 text-sm text-[#41473b]">
                                        {request.mentee_profile.bio}
                                      </p>
                                    )}
                                  </article>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
                </div>
                  </>
                )}
              </section>
            )}

            {showMenteeExperience && (
              <>
                <section className="rounded-lg border border-[#b9bba8] bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="workspace-heading text-2xl font-bold text-[#0c0a08]">
                        Browse volunteers
                      </h3>
                      <p className="mt-1 text-sm text-[#59604f]">
                        {includeOtherUniversities
                          ? "Select from available volunteers across Ontario universities."
                          : `Showing available volunteers at ${profileForm.university || "your university"}.`}
                      </p>
                    </div>
                    <p className="rounded-md bg-[#dfe2d5] px-4 py-2 text-xs font-bold text-[#2a3723]">
                      {filteredVolunteers.length} of {volunteers.length} volunteers
                    </p>
                  </div>
                  {isLoadingVolunteers && (
                    <p className="mt-3 text-sm text-[#59604f]">
                      Loading volunteers...
                    </p>
                  )}
                  {volunteerLoadError && (
                    <p className="mt-3 text-sm font-medium text-red-700">
                      {volunteerLoadError}
                    </p>
                  )}

                  {didAutoExpandUniversitySearch && includeOtherUniversities && (
                    <p className="mt-4 rounded-md border border-[#d3d1c8] bg-[#f5f3ed] px-4 py-3 text-sm text-[#41473b]">
                      No available volunteers were found at your university, so
                      the directory was expanded to all Ontario universities.
                    </p>
                  )}

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <label className="flex flex-col gap-2 text-xs font-semibold text-[#59604f]">
                      Search
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Name, university, or support format"
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm font-normal text-[#0c0a08] outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold text-[#59604f]">
                      University
                      <select
                        value={universityFilter}
                        onChange={(event) => {
                          setUniversityFilter(event.target.value);
                          setSelectedVolunteerId("");
                        }}
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm font-normal text-[#0c0a08] outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="all">All universities</option>
                        {universityOptions.map((university) => (
                          <option key={university} value={university}>
                            {university}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold text-[#59604f]">
                      Availability
                      <select
                        value={availabilityFilter}
                        onChange={(event) =>
                          setAvailabilityFilter(event.target.value)
                        }
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm font-normal text-[#0c0a08] outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="all">All availability</option>
                        {availabilityOptions.map((availability) => (
                          <option key={availability} value={availability}>
                            {availability}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {isApprovedMentee && (
                    <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-md border border-[#b9bba8] bg-[#f5f3ed] px-4 py-3 text-sm font-semibold text-[#2a3723]">
                      <input
                        type="checkbox"
                        checked={includeOtherUniversities}
                        onChange={(event) => {
                          setIncludeOtherUniversities(event.target.checked);
                          setDidAutoExpandUniversitySearch(false);
                          setUniversityFilter("all");
                          setSelectedVolunteerId("");
                        }}
                        className="h-4 w-4 rounded border-[#b9bba8] text-[#2a3723] focus:ring-[#2a3723]"
                      />
                      Include volunteers from other Ontario universities
                    </label>
                  )}
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  {filteredVolunteers.map((volunteer) => {
                    const isSelected = volunteer.id === selectedVolunteerId;
                    return (
                      <article
                        key={volunteer.id}
                        className={`hover-lift rounded-lg border bg-white p-5 shadow-sm transition ${
                          isSelected
                            ? "border-[#2a3723] ring-2 ring-[#b9bba8]"
                            : "border-[#d3d1c8] hover:border-[#7f8b73]"
                        }`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-lg font-bold text-[#0c0a08]">
                              {volunteer.name}
                            </h4>
                            <p className="text-sm text-[#59604f]">
                              {volunteer.city}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#2a3723]">
                              {volunteer.university}
                            </p>
                          </div>
                          {showMenteeExperience && isSelected && (
                            <span className="rounded-full bg-[#2a3723] px-3 py-1 text-xs font-bold text-white">
                              Selected
                            </span>
                          )}
                        </div>

                        <p className="mb-4 text-sm leading-6 text-[#41473b]">
                          {volunteer.bio}
                        </p>

                        <p className="mb-4 text-sm text-[#41473b]">
                          <span className="font-bold">Availability:</span>{" "}
                          {volunteer.availability}
                        </p>

                        {showMenteeExperience && (
                          <button
                            type="button"
                            onClick={() => handleSelectVolunteer(volunteer.id)}
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                              isSelected
                                ? "bg-[#dfe2d5] text-[#2a3723] hover:bg-[#cbd0c1]"
                                : "bg-[#2a3723] text-white hover:bg-[#1f2b1b]"
                            }`}
                          >
                            {isSelected
                              ? "Deselect volunteer"
                              : "Select volunteer"}
                          </button>
                        )}
                      </article>
                    );
                  })}
                  {filteredVolunteers.length === 0 && (
                    <article className="rounded-lg border border-dashed border-[#b9bba8] bg-white p-6 md:col-span-2">
                      <h4 className="text-lg font-bold text-[#0c0a08]">
                        No volunteers match this filter
                      </h4>
                      <p className="mt-2 text-sm text-[#59604f]">
                        Try clearing your filters or include volunteers from
                        other Ontario universities.
                      </p>
                    </article>
                  )}
                </section>

                {isApprovedMentee && (
                  <section className="portal-section">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="workspace-heading text-2xl font-bold text-[#0c0a08]">
                          Your sent requests
                        </h3>
                        <p className="mt-1 text-sm text-[#59604f]">
                          Track all volunteer requests you have submitted.
                        </p>
                      </div>
                    </div>

                    {isLoadingMenteeRequests && (
                      <p className="mt-4 text-sm text-[#59604f]">
                        Loading your requests...
                      </p>
                    )}
                    {menteeRequestsError && (
                      <p className="mt-4 text-sm font-medium text-red-700">
                        {menteeRequestsError}
                      </p>
                    )}

                    {!isLoadingMenteeRequests && menteeRequests.length === 0 && (
                      <article className="mt-4 rounded-lg border border-dashed border-[#b9bba8] bg-white p-4">
                        <p className="text-sm text-[#59604f]">
                          You have not sent any requests yet.
                        </p>
                      </article>
                    )}

                    <div className="mt-4 space-y-3">
                      {menteeRequests.map((request) => (
                        <article
                          key={request.id}
                          className="rounded-lg border border-[#d3d1c8] bg-white p-4"
                        >
                          <p className="text-base font-bold text-[#0c0a08]">
                            {request.mentor_profile?.full_name || "Unknown volunteer"}
                          </p>
                          <p className="text-sm text-[#59604f]">
                            Status: {request.status} - Sent{" "}
                            {new Date(request.created_at).toLocaleDateString()}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#2a3723]">
                            {formatUniversity(
                              request.mentor_profile?.university,
                            )}
                          </p>
                          {request.status === "active" && request.mentor_email && (
                            <p className="mt-1 text-sm text-[#41473b]">
                              <span className="font-bold">Volunteer email:</span>{" "}
                              {request.mentor_email}
                            </p>
                          )}
                          {request.mentor_profile?.bio && (
                            <p className="mt-2 text-sm text-[#41473b]">
                              {request.mentor_profile.bio}
                            </p>
                          )}
                          {request.status === "declined" && (
                            <div className="mt-3 rounded-md border border-[#f1cccc] bg-[#fff5f5] p-3">
                              <p className="font-bold text-[#8f2525]">
                                This volunteer declined the request.
                              </p>
                              <p className="mt-1 text-sm text-[#6f3434]">
                                Choose another available volunteer above to send a new request.
                              </p>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {showMenteeExperience && selectedVolunteer && (
                  <section className="sticky bottom-4 rounded-lg border border-[#b9bba8] bg-white p-6 shadow-lg">
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-sm text-[#59604f]">
                          Current selection
                        </p>
                        <p className="text-lg font-bold text-[#0c0a08]">
                          {selectedVolunteer.name}
                        </p>
                        <p className="text-sm text-[#59604f]">
                          {selectedVolunteer.university}
                        </p>
                      </div>

                      {selectedVolunteer && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="care-type"
                              className="text-sm font-bold text-[#2a3723]"
                            >
                              Type of care needed
                            </label>
                            <select
                              id="care-type"
                              value={careType}
                              onChange={(event) =>
                                setCareType(event.target.value)
                              }
                              className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                            >
                              <option value="">Select care type</option>
                              <option value="Dementia or Alzheimer's support">
                                Dementia or Alzheimer&apos;s support
                              </option>
                              <option value="Hospital / appointment navigation">
                                Hospital / appointment navigation
                              </option>
                              <option value="Mental health and emotional support">
                                Mental health and emotional support
                              </option>
                              <option value="General caregiving guidance">
                                General caregiving guidance
                              </option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                        </div>
                      )}

                      {requestError && (
                        <p className="text-sm font-semibold text-red-700">
                          {requestError}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={handleSendMatch}
                        disabled={
                          isSendingMatch ||
                          !selectedVolunteer ||
                          !careType
                        }
                        className="rounded-md bg-[#2a3723] px-5 py-3 text-sm font-bold text-white transition enabled:hover:bg-[#1f2b1b] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {isSendingMatch ? "Sending request..." : "Send match request"}
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {isUnlocked && isMatchSent && selectedVolunteer && (
          <section className="rounded-lg border border-[#b9bba8] bg-white p-8 shadow-sm">
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-[#2a3723]">
              Request Sent
            </p>
            <h3 className="text-2xl font-bold text-[#0c0a08]">
              Your request was sent to {selectedVolunteer.name}.
            </h3>
            <p className="mt-3 max-w-3xl text-[#41473b]">
              Thank you for submitting your request. The volunteer can now accept
              or decline it. You will receive an email when the status changes.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <section className="rounded-lg bg-[#f4f2ec] p-4">
                <h4 className="mb-3 text-sm font-extrabold uppercase tracking-[0.08em] text-[#2a3723]">
                  Requested Volunteer
                </h4>
                <p className="text-sm text-[#41473b]">
                  <span className="font-bold">Volunteer:</span>{" "}
                  {selectedVolunteer.name}
                </p>
                <p className="text-sm text-[#41473b]">
                  <span className="font-bold">University:</span>{" "}
                  {selectedVolunteer.university}
                </p>
                <p className="text-sm text-[#41473b]">
                  <span className="font-bold">Availability:</span>{" "}
                  {selectedVolunteer.availability}
                </p>
              </section>

              <section className="rounded-lg bg-[#f4f2ec] p-4">
                <h4 className="mb-3 text-sm font-extrabold uppercase tracking-[0.08em] text-[#2a3723]">
                  Your Application
                </h4>
                <p className="text-sm text-[#41473b]">
                  <span className="font-bold">Care type needed:</span>{" "}
                  {careType}
                </p>
              </section>
            </div>

            <button
              type="button"
              onClick={handleRequestAnotherMentor}
              className="mt-6 rounded-md bg-[#0c0a08] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1f2b1b]"
            >
              View request status
            </button>
          </section>
        )}

        {isUnlocked && isSettingsOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
            <section className="pop-in max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[#b9bba8] bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-2xl font-bold text-[#0c0a08]">
                    Settings
                  </h3>
                  <p className="mt-1 text-sm text-[#59604f]">
                    Update your profile details and preferences.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="rounded-md bg-[#dfe2d5] px-3 py-1 text-sm font-bold text-[#2a3723]"
                >
                  Close
                </button>
              </div>

              {profileData?.profile?.role && (
                <p className="mt-4 inline-flex rounded-md bg-[#dfe2d5] px-4 py-2 text-xs font-bold text-[#2a3723]">
                  {profileData.profile.role} -{" "}
                  {profileData.profile.approval_status}
                </p>
              )}

              {isProfileLoading && (
                <p className="mt-4 text-sm text-[#59604f]">
                  Loading profile...
                </p>
              )}
              {profileError && (
                <p className="mt-4 text-sm font-medium text-red-700">
                  {profileError}
                </p>
              )}
              {profileSaveMessage && (
                <p className="mt-4 text-sm font-medium text-green-700">
                  {profileSaveMessage}
                </p>
              )}

              {!isProfileLoading && (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="profile-username"
                      className="text-sm font-bold text-[#2a3723]"
                    >
                      Username
                    </label>
                    <input
                      id="profile-username"
                      type="text"
                      value={profileForm.username}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                      minLength={3}
                      maxLength={30}
                      pattern="[A-Za-z0-9_]+"
                      className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="profile-full-name"
                      className="text-sm font-bold text-[#2a3723]"
                    >
                      Full name
                    </label>
                    <input
                      id="profile-full-name"
                      type="text"
                      value={profileForm.fullName}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fullName: event.target.value,
                        }))
                      }
                      className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                    />
                  </div>

                  {userRole !== "admin" && (
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <label
                        htmlFor="profile-university"
                        className="text-sm font-bold text-[#2a3723]"
                      >
                        Ontario university
                      </label>
                      <select
                        id="profile-university"
                        value={profileForm.university}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            university: event.target.value,
                          }))
                        }
                        required
                        className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                      >
                        <option value="">Select your university</option>
                        {ONTARIO_UNIVERSITIES.map((university) => (
                          <option key={university} value={university}>
                            {university}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="md:col-span-2 flex flex-col gap-2">
                    <label
                      htmlFor="profile-bio"
                      className="text-sm font-bold text-[#2a3723]"
                    >
                      Bio
                    </label>
                    <textarea
                      id="profile-bio"
                      rows={3}
                      value={profileForm.bio}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          bio: event.target.value,
                        }))
                      }
                      className="resize-y rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                    />
                  </div>

                  {userRole === "mentor" && (
                    <>
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="profile-mentor-mode"
                          className="text-sm font-bold text-[#2a3723]"
                        >
                          Support format
                        </label>
                        <select
                          id="profile-mentor-mode"
                          value={profileForm.mentorMode}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              mentorMode: event.target.value,
                            }))
                          }
                          className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                        >
                          <option value="Remote">Remote</option>
                          <option value="In person">In person</option>
                          <option value="Hybrid">Hybrid</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="profile-availability"
                          className="text-sm font-bold text-[#2a3723]"
                        >
                          Availability
                        </label>
                        <input
                          id="profile-availability"
                          type="text"
                          value={profileForm.availability}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              availability: event.target.value,
                            }))
                          }
                          className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                        />
                      </div>
                      <div className="md:col-span-2 flex items-center gap-2">
                        <input
                          id="profile-visible"
                          type="checkbox"
                          checked={profileForm.isVisible}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              isVisible: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-[#b9bba8] text-[#2a3723] focus:ring-[#2a3723]"
                        />
                        <label
                          htmlFor="profile-visible"
                          className="text-sm font-bold text-[#2a3723]"
                        >
                          Accepting new caregiver matches
                        </label>
                      </div>
                      <div className="md:col-span-2 flex items-center gap-2">
                        <input
                          id="profile-same-university-only"
                          type="checkbox"
                          checked={profileForm.sameUniversityOnly}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              sameUniversityOnly: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-[#b9bba8] text-[#2a3723] focus:ring-[#2a3723]"
                        />
                        <label
                          htmlFor="profile-same-university-only"
                          className="text-sm font-bold text-[#2a3723]"
                        >
                          Only show my profile to caregivers at my university
                        </label>
                      </div>
                    </>
                  )}

                  {userRole === "mentee" && (
                    <>
                      <div className="md:col-span-2 flex flex-col gap-2">
                        <label
                          htmlFor="profile-goals"
                          className="text-sm font-bold text-[#2a3723]"
                        >
                          Goals
                        </label>
                        <textarea
                          id="profile-goals"
                          rows={2}
                          value={profileForm.goals}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              goals: event.target.value,
                            }))
                          }
                          className="resize-y rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                        />
                      </div>
                      <div className="md:col-span-2 flex flex-col gap-2">
                        <label
                          htmlFor="profile-interests"
                          className="text-sm font-bold text-[#2a3723]"
                        >
                          Interests (comma-separated)
                        </label>
                        <input
                          id="profile-interests"
                          type="text"
                          value={profileForm.interests}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              interests: event.target.value,
                            }))
                          }
                          className="rounded-md border border-[#b9bba8] px-4 py-3 text-sm outline-none ring-[#9ca48f] transition focus:border-[#2a3723] focus:ring-2"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isProfileLoading || isProfileSaving}
                className="mt-5 rounded-md bg-[#0c0a08] px-5 py-3 text-sm font-bold text-white transition enabled:hover:bg-[#1f2b1b] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isProfileSaving ? "Saving..." : "Save profile"}
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
