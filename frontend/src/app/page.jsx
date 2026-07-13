"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Pill from "../components/Pill";
import {
  apiFetch,
  BACKEND_BASE_URL,
  buildMentorAvailability,
  normalizeMentor,
  parseCommaSeparated,
  parseMentorAvailability,
  profilePayloadFromMetadata,
} from "../lib/portalUtils";
import { supabase, hasSupabaseEnv } from "../lib/supabaseClient";

export default function Home() {
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [signupRole, setSignupRole] = useState("mentee");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupFullName, setSignupFullName] = useState("");
  const [signupBio, setSignupBio] = useState("");
  const [signupProfilePictureUrl, setSignupProfilePictureUrl] = useState("");
  const [signupSkills, setSignupSkills] = useState("");
  const [signupMentorMode, setSignupMentorMode] = useState("Remote");
  const [signupAvailability, setSignupAvailability] = useState("");
  const [signupGoals, setSignupGoals] = useState("");
  const [signupInterests, setSignupInterests] = useState("");
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
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [profileData, setProfileData] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const [profileForm, setProfileForm] = useState({
    role: "mentee",
    username: "",
    fullName: "",
    bio: "",
    profilePictureUrl: "",
    isVisible: false,
    skills: "",
    mentorMode: "Remote",
    availability: "",
    goals: "",
    interests: "",
  });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [adminPendingUsers, setAdminPendingUsers] = useState([]);
  const [adminReviewedUsers, setAdminReviewedUsers] = useState([]);
  const [adminMetrics, setAdminMetrics] = useState(null);
  const [adminMentors, setAdminMentors] = useState([]);
  const [adminMatches, setAdminMatches] = useState([]);
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
  const [mentorViewMode, setMentorViewMode] = useState("directory");
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

  const specialtyOptions = useMemo(
    () =>
      [...new Set(volunteers.flatMap((volunteer) => volunteer.focus))].sort(),
    [volunteers],
  );

  const filteredVolunteers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return volunteers.filter((volunteer) => {
      const matchesAvailability =
        availabilityFilter === "all" ||
        volunteer.availability === availabilityFilter;
      const matchesSpecialty =
        specialtyFilter === "all" || volunteer.focus.includes(specialtyFilter);

      if (!normalizedSearch) {
        return matchesAvailability && matchesSpecialty;
      }

      const searchableText = [
        volunteer.name,
        volunteer.pronouns,
        volunteer.city,
        volunteer.bio,
        volunteer.availability,
        ...volunteer.languages,
        ...volunteer.focus,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchableText.includes(normalizedSearch);

      return matchesAvailability && matchesSpecialty && matchesSearch;
    });
  }, [availabilityFilter, searchQuery, specialtyFilter, volunteers]);

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
  const isAwaitingApproval =
    (isMentee || isMentor) && approvalStatus !== "approved";
  const showAdminDashboard = isAdmin && adminViewMode === "admin";
  const showMenteeExperience =
    isApprovedMentee || (isAdmin && adminViewMode === "mentee");
  const showMentorDirectory = isApprovedMentor && mentorViewMode === "directory";
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
          throw new Error(`Failed to load profile (${response.status})`);
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
          bio: profile.bio ?? "",
          profilePictureUrl: profile.profile_picture_url ?? "",
          isVisible: Boolean(profile.is_visible),
          skills: (mentorProfile.skills ?? []).join(", "),
          mentorMode: mentorAvailabilityInfo.mentorMode,
          availability: mentorAvailabilityInfo.availability,
          goals: menteeProfile.goals ?? "",
          interests: (menteeProfile.interests ?? []).join(", "),
        });
      } catch (error) {
        setProfileError(
          error instanceof Error
            ? error.message
            : "Could not load your profile.",
        );
      } finally {
        setIsProfileLoading(false);
      }
    }

    loadProfile();
  }, [isUnlocked]);

  useEffect(() => {
    if (!isUnlocked || !(showMenteeExperience || showMentorDirectory)) {
      setVolunteers([]);
      setIsLoadingVolunteers(false);
      setVolunteerLoadError("");
      return;
    }

    async function loadVolunteers() {
      const token = window.localStorage.getItem("ocgoAccessToken");

      if (!token) {
        setVolunteers([]);
        setVolunteerLoadError(
          "Your session has expired. Sign in again to load volunteers.",
        );
        return;
      }

      setIsLoadingVolunteers(true);
      setVolunteerLoadError("");

      try {
        const response = await apiFetch(
          `${BACKEND_BASE_URL}/api/matches/mentors/available`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          let detail = "";
          try {
            const errorPayload = await response.json();
            detail =
              errorPayload?.detail ||
              errorPayload?.message ||
              errorPayload?.error ||
              "";
          } catch (_error) {
            detail = "";
          }

          if (response.status === 403) {
            throw new Error(
              "Account not approved yet. Please wait for admin approval.",
            );
          }

          throw new Error(detail || `Failed to load mentors (${response.status})`);
        }

        const data = await response.json();
        const normalized = (data.mentors ?? []).map(normalizeMentor);
        setVolunteers(normalized);
      } catch (error) {
        setVolunteers([]);
        setVolunteerLoadError(
          error instanceof Error
            ? error.message
            : "Could not load volunteers from backend.",
        );
      } finally {
        setIsLoadingVolunteers(false);
      }
    }

    loadVolunteers();
  }, [isUnlocked, showMenteeExperience, showMentorDirectory]);

  async function handleSaveProfile() {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setProfileError("Missing access token. Please sign in again.");
      return;
    }

    const role = profileData?.profile?.role ?? profileForm.role;
    const payload = {
      username: profileForm.username.trim(),
      full_name: profileForm.fullName.trim(),
      bio: profileForm.bio.trim(),
      profile_picture_url: profileForm.profilePictureUrl.trim(),
      is_visible: profileForm.isVisible,
      skills: parseCommaSeparated(profileForm.skills),
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

    if (role !== "mentor") {
      delete payload.skills;
      delete payload.availability;
      delete payload.is_visible;
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
        let detail = "";
        try {
          const errorPayload = await response.json();
          detail =
            errorPayload?.detail ||
            errorPayload?.message ||
            errorPayload?.error ||
            "";
        } catch (_error) {
          detail = "";
        }
        throw new Error(detail || `Failed to save profile (${response.status})`);
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
        bio: updatedProfile.bio ?? "",
        profilePictureUrl: updatedProfile.profile_picture_url ?? "",
        isVisible: Boolean(updatedProfile.is_visible),
        skills: (updatedMentor.skills ?? []).join(", "),
        mentorMode: updatedMentorAvailabilityInfo.mentorMode,
        availability: updatedMentorAvailabilityInfo.availability,
        goals: updatedMentee.goals ?? "",
        interests: (updatedMentee.interests ?? []).join(", "),
      });
      setProfileSaveMessage("Profile saved.");
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Could not save profile.",
      );
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
        metricsResponse,
        mentorsResponse,
        sessionsResponse,
        matchesResponse,
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
        ]);

      if (!pendingResponse.ok) {
        throw new Error(
          `Failed to load pending requests (${pendingResponse.status})`,
        );
      }
      if (!reviewedResponse.ok) {
        throw new Error(
          `Failed to load reviewed requests (${reviewedResponse.status})`,
        );
      }
      if (!metricsResponse.ok) {
        throw new Error(
          `Failed to load dashboard metrics (${metricsResponse.status})`,
        );
      }
      if (!mentorsResponse.ok) {
        throw new Error(`Failed to load mentors (${mentorsResponse.status})`);
      }
      if (!sessionsResponse.ok) {
        throw new Error(
          `Failed to load volunteer sessions (${sessionsResponse.status})`,
        );
      }
      if (!matchesResponse.ok) {
        throw new Error(`Failed to load matches (${matchesResponse.status})`);
      }

      const pendingData = await pendingResponse.json();
      const reviewedData = await reviewedResponse.json();
      const metricsData = await metricsResponse.json();
      const mentorsData = await mentorsResponse.json();
      const sessionsData = await sessionsResponse.json();
      const matchesData = await matchesResponse.json();

      setAdminPendingUsers(pendingData.pending_users ?? []);
      setAdminReviewedUsers(reviewedData.reviewed_users ?? []);
      setAdminMetrics(metricsData);
      setAdminMentors(mentorsData.mentors ?? []);
      setAdminSessionEntries(sessionsData.entries ?? []);
      setAdminSessionsTotal(sessionsData.total_hours ?? 0);
      setAdminMatches(matchesData.matches ?? []);
      setAdminSelectedReviewedUser((current) => {
        if (!current) return null;
        return (
          (reviewedData.reviewed_users ?? []).find(
            (user) => user.id === current.id,
          ) ?? null
        );
      });
    } catch (error) {
      setAdminError(
        error instanceof Error
          ? error.message
          : "Could not load admin dashboard data.",
      );
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
        throw new Error(`Failed to load mentor details (${response.status})`);
      }

      const data = await response.json();
      setAdminSelectedMentor(data.mentor ?? null);
      setAdminSelectedMentorRequests(data.requests ?? []);
    } catch (error) {
      setAdminSelectedMentor(null);
      setAdminSelectedMentorRequests([]);
      setAdminMentorDetailsError(
        error instanceof Error
          ? error.message
          : "Could not load mentor details.",
      );
    } finally {
      setIsLoadingAdminMentorDetails(false);
    }
  }

  useEffect(() => {
    if (!isUnlocked || !isAdmin) {
      setAdminPendingUsers([]);
      setAdminReviewedUsers([]);
      setAdminMetrics(null);
      setAdminMentors([]);
      setAdminMatches([]);
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

    loadAdminDashboardData();
  }, [isAdmin, isUnlocked]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminViewMode("admin");
    }
  }, [isAdmin]);

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
        throw new Error(`Failed to load your requests (${response.status})`);
      }

      const data = await response.json();
      setMenteeRequests(data.requests ?? []);
    } catch (error) {
      setMenteeRequests([]);
      setMenteeRequestsError(
        error instanceof Error ? error.message : "Could not load your requests.",
      );
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
        let detail = "";
        try {
          const errorPayload = await response.json();
          detail =
            errorPayload?.detail ||
            errorPayload?.message ||
            errorPayload?.error ||
            "";
        } catch (_error) {
          detail = "";
        }
        throw new Error(detail || `Failed to load requests (${response.status})`);
      }

      const data = await response.json();
      setMentorRequests(data.requests ?? []);
    } catch (error) {
      setMentorRequests([]);
      setMentorRequestsError(
        error instanceof Error
          ? error.message === "Failed to fetch"
            ? "Temporary backend connection issue. Please refresh."
            : error.message
          : "Could not load caregiver requests.",
      );
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
        throw new Error(`Failed to load volunteer hours (${response.status})`);
      }

      const data = await response.json();
      setMentorHoursEntries(data.entries ?? []);
      setMentorHoursTotal(data.total_hours ?? 0);
    } catch (error) {
      setMentorHoursEntries([]);
      setMentorHoursTotal(0);
      setMentorHoursError(
        error instanceof Error
          ? error.message
          : "Could not load volunteer hour logs.",
      );
    } finally {
      setIsMentorHoursLoading(false);
    }
  }

  async function handleMentorDecision(matchId, decision) {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setMentorDecisionError("Missing access token. Please sign in again.");
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
        throw new Error(`Failed to ${decision} request (${response.status})`);
      }

      setMentorDecisionSuccess(
        decision === "accept"
          ? "Caregiver request accepted."
          : "Caregiver request declined.",
      );
      await loadMentorRequestsData();
    } catch (error) {
      setMentorDecisionError(
        error instanceof Error
          ? error.message
          : "Could not update this request.",
      );
    } finally {
      setMentorDecisionLoadingId(null);
    }
  }

  async function handleLogMentorHours(event) {
    event.preventDefault();

    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setMentorHoursError("Missing access token. Please sign in again.");
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
        throw new Error(`Failed to log volunteer hours (${response.status})`);
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
    } catch (error) {
      setMentorHoursError(
        error instanceof Error
          ? error.message
          : "Could not log volunteer hours.",
      );
    } finally {
      setIsMentorHoursSaving(false);
    }
  }

  useEffect(() => {
    if (!isApprovedMentor) {
      setMentorViewMode("directory");
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
      setAdminError("Missing access token. Please sign in again.");
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
        throw new Error(`Failed to ${action} request (${response.status})`);
      }

      setAdminSuccess(
        action === "approve"
          ? "Request approved successfully."
          : "Request rejected successfully.",
      );
      await loadAdminDashboardData();
    } catch (error) {
      setAdminError(
        error instanceof Error
          ? error.message
          : "Could not update this request.",
      );
    } finally {
      setAdminActionUserId("");
    }
  }

  async function handleRemoveMentorAccess(mentorId) {
    const token = window.localStorage.getItem("ocgoAccessToken");
    if (!token) {
      setAdminError("Missing access token. Please sign in again.");
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
        throw new Error(`Failed to remove mentor access (${response.status})`);
      }

      setAdminSuccess("Volunteer listing and access removed.");
      setAdminSelectedMentor(null);
      setAdminSelectedMentorRequests([]);
      await loadAdminDashboardData();
    } catch (error) {
      setAdminError(
        error instanceof Error
          ? error.message
          : "Could not remove mentor access.",
      );
    } finally {
      setAdminActionUserId("");
    }
  }

  async function handleUnlock(event) {
    event.preventDefault();
    if (!hasSupabaseEnv || !supabase) {
      setAuthError(
        "Supabase env is missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
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
        profile_picture_url: signupProfilePictureUrl.trim() || null,
      };

      if (signupRole === "mentor") {
        payload.skills = parseCommaSeparated(signupSkills);
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
        throw new Error(`Failed to create profile (${response.status})`);
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
          profile_picture_url: signupProfilePictureUrl.trim() || null,
        };

        if (signupRole === "mentor") {
          signupMetadata.skills = parseCommaSeparated(signupSkills);
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
          setAuthSuccess(
            "Account created. Confirm your email, then sign in to finish profile setup.",
          );
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
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Authentication failed.",
      );
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
      setRequestError("Missing access token. Please sign in again.");
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
        let detail = "";
        try {
          const errorPayload = await response.json();
          detail =
            errorPayload?.detail ||
            errorPayload?.message ||
            errorPayload?.error ||
            "";
        } catch (_error) {
          detail = "";
        }
        throw new Error(
          detail || `Failed to send match request (${response.status})`,
        );
      }

      await loadMenteeRequestsData();
      setIsMatchSent(true);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Could not send the match request. Please try again.",
      );
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

  function handleStartOver() {
    if (supabase) {
      supabase.auth.signOut();
    }
    window.localStorage.removeItem("ocgoAccessToken");
    setEmailInput("");
    setPasswordInput("");
    setIsUnlocked(false);
    setIsAuthLoading(false);
    setAuthError("");
    setAuthSuccess("");
    setSignupRole("mentee");
    setSignupUsername("");
    setSignupFullName("");
    setSignupBio("");
    setSignupProfilePictureUrl("");
    setSignupSkills("");
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
    setAvailabilityFilter("all");
    setSpecialtyFilter("all");
    setProfileData(null);
    setIsProfileLoading(false);
    setIsProfileSaving(false);
    setProfileError("");
    setProfileSaveMessage("");
    setIsProfileMenuOpen(false);
    setIsSettingsOpen(false);
    setAdminPendingUsers([]);
    setAdminReviewedUsers([]);
    setAdminMetrics(null);
    setAdminMentors([]);
    setAdminMatches([]);
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
    setMentorViewMode("directory");
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
      bio: "",
      profilePictureUrl: "",
      isVisible: false,
      skills: "",
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

  return (
    <div className="min-h-full bg-[#efefef] text-[#2c2455]">
      <header className="border-b border-[#ded6fb] bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6d57b8]">
                Peer Support Portal
              </p>
              <h1 className="text-xl font-extrabold text-[#2c2455]">
                Caregiver Volunteer Matching
              </h1>
            </div>
          </div>
          {isUnlocked && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[#d7d2ea] bg-[#f7f4ff] text-sm font-bold text-[#4a3c86]"
                aria-label="Open profile menu"
              >
                {profileForm.profilePictureUrl ? (
                  <Image
                    src={profileForm.profilePictureUrl}
                    alt="Profile"
                    width={44}
                    height={44}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  userInitial
                )}
              </button>

              {isProfileMenuOpen && (
                <div className="pop-in absolute right-0 mt-2 w-48 rounded-xl border border-[#e5e0f4] bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#3f346c] hover:bg-[#f7f4ff]"
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

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
        {!isUnlocked && (
        <section className="rounded-3xl bg-linear-to-r from-[#6d57b8] to-[#8169c9] p-8 text-white shadow-sm">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-[#efeaff]">
            Welcome
          </p>
          <h2 className="mb-2 text-3xl font-semibold leading-tight">
            Connect with a peer volunteer who understands caregiving.
          </h2>
          <p className="max-w-3xl text-[#efeaff]">
            match with a peer volunteer who understands caregiving.
          </p>
        </section>
        )}

        {!isUnlocked && (
          <section className="rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-[#2c2455]">
              Sign in to continue
            </h3>
            <form
              className="mt-5 flex flex-col gap-3 sm:max-w-md"
              onSubmit={handleUnlock}
            >
              <label
                htmlFor="portal-email"
                className="text-sm font-bold text-[#3f346c]"
              >
                Email
              </label>
              <input
                id="portal-email"
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="you@example.com"
                className="rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
              />
              <label
                htmlFor="portal-password"
                className="text-sm font-bold text-[#3f346c]"
              >
                Password
              </label>
              <input
                id="portal-password"
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder="Enter password"
                className="rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
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
                    className="text-sm font-bold text-[#3f346c]"
                  >
                    I am signing up as
                  </label>
                  <select
                    id="signup-role"
                    value={signupRole}
                    onChange={(event) => setSignupRole(event.target.value)}
                    className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                  >
                    <option value="mentee">Caregiver</option>
                    <option value="mentor">Volunteer</option>
                  </select>

                  <label
                    htmlFor="signup-username"
                    className="text-sm font-bold text-[#3f346c]"
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
                    className="rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                  />

                  <label
                    htmlFor="signup-full-name"
                    className="text-sm font-bold text-[#3f346c]"
                  >
                    Full name
                  </label>
                  <input
                    id="signup-full-name"
                    type="text"
                    value={signupFullName}
                    onChange={(event) => setSignupFullName(event.target.value)}
                    placeholder="Your full name"
                    className="rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                  />

                  <label
                    htmlFor="signup-pfp"
                    className="text-sm font-bold text-[#3f346c]"
                  >
                    Profile picture URL
                  </label>
                  <input
                    id="signup-pfp"
                    type="url"
                    value={signupProfilePictureUrl}
                    onChange={(event) =>
                      setSignupProfilePictureUrl(event.target.value)
                    }
                    placeholder="https://..."
                    className="rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                  />

                  <label
                    htmlFor="signup-bio"
                    className="text-sm font-bold text-[#3f346c]"
                  >
                    Short bio
                  </label>
                  <textarea
                    id="signup-bio"
                    value={signupBio}
                    onChange={(event) => setSignupBio(event.target.value)}
                    rows={3}
                    placeholder="Tell us about yourself..."
                    className="resize-y rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                  />

                  {signupRole === "mentor" && (
                    <>
                      <label
                        htmlFor="signup-skills"
                        className="text-sm font-bold text-[#3f346c]"
                      >
                        Skills (comma-separated)
                      </label>
                      <input
                        id="signup-skills"
                        type="text"
                        value={signupSkills}
                        onChange={(event) =>
                          setSignupSkills(event.target.value)
                        }
                        placeholder="Dementia support, Care navigation"
                        className="rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                      <label
                        htmlFor="signup-mentor-mode"
                        className="text-sm font-bold text-[#3f346c]"
                      >
                        Support format
                      </label>
                      <select
                        id="signup-mentor-mode"
                        value={signupMentorMode}
                        onChange={(event) =>
                          setSignupMentorMode(event.target.value)
                        }
                        className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      >
                        <option value="Remote">Remote</option>
                        <option value="In person">In person</option>
                      </select>
                      <label
                        htmlFor="signup-availability"
                        className="text-sm font-bold text-[#3f346c]"
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
                        className="rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                    </>
                  )}

                  {signupRole === "mentee" && (
                    <>
                      <label
                        htmlFor="signup-goals"
                        className="text-sm font-bold text-[#3f346c]"
                      >
                        Goals
                      </label>
                      <textarea
                        id="signup-goals"
                        value={signupGoals}
                        onChange={(event) => setSignupGoals(event.target.value)}
                        rows={2}
                        placeholder="What support are you looking for?"
                        className="resize-y rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                      <label
                        htmlFor="signup-interests"
                        className="text-sm font-bold text-[#3f346c]"
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
                        className="rounded-xl border border-[#d7d2ea] px-4 py-3 outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                    </>
                  )}
                </>
              )}
              <button
                type="submit"
                disabled={isAuthLoading}
                className="mt-2 inline-flex w-fit items-center rounded-full bg-[#7a63b7] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#654ea5]"
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
                className="w-fit text-sm font-semibold text-[#6d57b8] underline"
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
              <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-red-900">
                  Could not load account profile
                </h3>
                <p className="mt-2 text-sm text-red-800">{profileError}</p>
                <p className="mt-2 text-sm text-red-800">
                  This usually means your API token is invalid/expired or
                  backend JWT config is mismatched.
                </p>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="mt-4 rounded-full bg-red-700 px-5 py-2 text-sm font-bold text-white hover:bg-red-800"
                >
                  Sign out and try again
                </button>
              </section>
            )}

            {!isProfileLoading && !profileError && isAwaitingApproval && (
              <section className="rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-sm">
                <p className="text-sm font-bold uppercase tracking-[0.08em] text-[#6d57b8]">
                  Account pending
                </p>
                <h3 className="mt-2 text-2xl font-bold text-[#2c2455]">
                  Your {userRole === "mentor" ? "volunteer" : "caregiver"} profile is waiting for admin approval.
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-[#5c5385]">
                  You can update your bio and profile picture from Settings,
                  but matching, requests, and volunteer-hour tools stay
                  locked until an admin approves this account.
                </p>
              </section>
            )}

            {!isProfileLoading && !profileError && isApprovedMentor && (
              <nav className="workspace-tabs" aria-label="Volunteer workspace">
                <div className="inline-flex rounded-full bg-[#f0ecff] p-1">
                  <button
                    type="button"
                    onClick={() => setMentorViewMode("directory")}
                    className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.08em] ${
                      mentorViewMode === "directory"
                        ? "bg-white text-[#4a3c86]"
                        : "text-[#4a3c86] hover:bg-white/60"
                    }`}
                  >
                    All volunteers
                  </button>
                  <button
                    type="button"
                    onClick={() => setMentorViewMode("requests")}
                    className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.08em] ${
                      mentorViewMode === "requests"
                        ? "bg-white text-[#4a3c86]"
                        : "text-[#4a3c86] hover:bg-white/60"
                    }`}
                  >
                    Caregiver requests
                  </button>
                  <button
                    type="button"
                    onClick={() => setMentorViewMode("mentees")}
                    className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.08em] ${
                      mentorViewMode === "mentees"
                        ? "bg-white text-[#4a3c86]"
                        : "text-[#4a3c86] hover:bg-white/60"
                    }`}
                  >
                    My caregivers
                  </button>
                </div>
              </nav>
            )}

            {!isProfileLoading && !profileError && showMentorRequests && (
              <section className="rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="workspace-heading text-2xl font-bold text-[#2c2455]">
                    Caregiver requests
                  </h3>
                </div>

                {isLoadingMentorRequests && (
                  <p className="mt-4 text-sm text-[#5c5385]">
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
                  <article className="mt-4 rounded-2xl border border-dashed border-[#d7d2ea] bg-white p-4">
                    <p className="text-sm text-[#5c5385]">No requests yet.</p>
                  </article>
                )}
                <div className="mt-4 space-y-3">
                  {mentorRequests.map((request) => (
                    <article
                      key={request.id}
                      className="request-record rounded-2xl border border-[#e5e0f4] bg-white"
                    >
                      <header className="request-record-header flex flex-wrap items-start justify-between gap-4 border-b border-[#e5e0f4] px-6 py-5">
                        <div>
                          <p className="text-xl font-extrabold text-[#2c2455]">
                            {request.mentee_profile?.full_name || "Unnamed caregiver"}
                          </p>
                          <p className="mt-1 text-sm text-[#5c5385]">
                            Submitted {new Date(request.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span className={`request-status request-status-${request.status}`}>
                          {request.status}
                        </span>
                      </header>

                      <div className="grid gap-0 md:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.8fr)]">
                        <div className="px-6 py-6 md:border-r md:border-[#e5e0f4]">
                          <p className="request-label">Support requested</p>
                          <p className="mt-2 text-lg font-bold leading-7 text-[#2c2455]">
                            {request.care_type || "Not specified"}
                          </p>

                          <p className="request-label mt-7">About the caregiver</p>
                          <p className="mt-2 max-w-3xl text-base leading-7 text-[#4f4578]">
                            {request.mentee_profile?.bio || "No bio provided."}
                          </p>
                        </div>

                        <aside className="bg-[#faf8ff] px-6 py-6">
                          <p className="request-label">Contact</p>
                          <p className="mt-2 break-all text-base font-semibold text-[#2c2455]">
                            {request.mentee_email || "No email available"}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[#5c5385]">
                            Contact details are available after approval for arranging the first meeting.
                          </p>
                        </aside>
                      </div>

                      <footer className="flex flex-wrap items-center gap-3 border-t border-[#e5e0f4] px-6 py-5">
                        {request.status === "pending" ? (
                          <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMentorDecision(request.id, "accept")
                                  }
                                  disabled={mentorDecisionLoadingId === request.id}
                                  className="rounded-full bg-[#2c2455] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white transition enabled:hover:bg-[#201943] disabled:cursor-not-allowed disabled:bg-slate-300"
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
                                  className="rounded-full bg-[#fff2f2] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#9b2c2c] transition enabled:hover:bg-[#ffe3e3] disabled:cursor-not-allowed disabled:bg-slate-200"
                                >
                                  Decline request
                                </button>
                          </>
                        ) : request.status === "active" ? (
                          <p className="text-sm font-semibold text-green-700">
                            This caregiver is an active match.
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-[#5c5385]">
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
              <section className="rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="workspace-heading text-2xl font-bold text-[#2c2455]">
                    My caregivers
                  </h3>
                </div>

                <section className="mt-4 rounded-2xl border border-[#e5e0f4] bg-[#faf8ff] p-4">
                  <h4 className="text-base font-bold text-[#2c2455]">
                    Active caregiver connections
                  </h4>
                  <p className="mt-1 text-sm text-[#5c5385]">
                    After accepting a request, use this roster for contact and
                    volunteer-hour logging.
                  </p>
                  {activeMenteeConnections.length === 0 ? (
                    <p className="mt-3 text-sm text-[#5c5385]">
                      No active caregiver connections yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {activeMenteeConnections.map((request) => (
                        <article
                          key={`active-${request.id}`}
                          className="rounded-xl border border-[#e5e0f4] bg-white p-3 text-sm text-[#4f4578]"
                        >
                          <p className="font-bold text-[#2c2455]">
                            {request.mentee_profile?.full_name ||
                              "Unnamed caregiver"}
                          </p>
                          <p>
                            <span className="font-bold">Email:</span>{" "}
                            {request.mentee_email || "No email available"}
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

                <section className="mt-6 rounded-2xl border border-[#e5e0f4] bg-[#faf8ff] p-4">
                  <h4 className="text-base font-bold text-[#2c2455]">
                    Volunteer hours and meetings
                  </h4>
                  <p className="mt-1 text-sm text-[#5c5385]">
                    Log each session with date, hours, next meeting, and topics
                    discussed.
                  </p>
                  <p className="mt-2 text-sm font-bold text-[#4a3c86]">
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
                        className="text-sm font-bold text-[#3f346c]"
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
                        className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
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
                        className="text-sm font-bold text-[#3f346c]"
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
                        className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-hours"
                        className="text-sm font-bold text-[#3f346c]"
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
                        className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-next-meeting"
                        className="text-sm font-bold text-[#3f346c]"
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
                        className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-topics"
                        className="text-sm font-bold text-[#3f346c]"
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
                        className="resize-y rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <label
                        htmlFor="mentor-hours-flags"
                        className="text-sm font-bold text-[#3f346c]"
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
                        className="resize-y rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        disabled={
                          isMentorHoursSaving || activeMenteeConnections.length === 0
                        }
                        className="rounded-full bg-[#2c2455] px-5 py-3 text-sm font-bold text-white transition enabled:hover:bg-[#201943] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {isMentorHoursSaving ? "Saving..." : "Log volunteer hours"}
                      </button>
                    </div>
                  </form>

                  {isMentorHoursLoading ? (
                    <p className="mt-3 text-sm text-[#5c5385]">
                      Loading volunteer logs...
                    </p>
                  ) : mentorHoursEntries.length === 0 ? (
                    <p className="mt-3 text-sm text-[#5c5385]">
                      No volunteer sessions logged yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {mentorHoursEntries.slice(0, 5).map((entry) => (
                        <article
                          key={`hour-entry-${entry.id}`}
                          className="rounded-xl border border-[#e5e0f4] bg-white p-3 text-sm text-[#4f4578]"
                        >
                          <p className="font-bold text-[#2c2455]">
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
                <section className="rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-sm">
                  <h3 className="text-2xl font-bold text-[#2c2455]">
                    Account loaded
                  </h3>
                  <p className="mt-2 text-sm text-[#5c5385]">
                    We could not determine a supported role for this account
                    yet.
                  </p>
                  <p className="mt-2 text-sm text-[#5c5385]">
                    Current role:{" "}
                    <span className="font-bold">
                      {userRole || "unassigned"}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-[#5c5385]">
                    Approval status:{" "}
                    <span className="font-bold">
                      {profileData?.profile?.approval_status ?? "unknown"}
                    </span>
                  </p>
                </section>
              )}

            {isAdmin && (
              <nav className="workspace-tabs" aria-label="Admin workspace">
                <div className="inline-flex rounded-full bg-[#f0ecff] p-1">
                  <button
                    type="button"
                    onClick={() => setAdminViewMode("admin")}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      adminViewMode === "admin"
                        ? "bg-white text-[#4a3c86] shadow-sm"
                        : "text-[#4a3c86] hover:bg-white/60"
                    }`}
                  >
                    Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminViewMode("mentee")}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      adminViewMode === "mentee"
                        ? "bg-white text-[#4a3c86] shadow-sm"
                        : "text-[#4a3c86] hover:bg-white/60"
                    }`}
                  >
                    Caregiver experience
                  </button>
                </div>
              </nav>
            )}

            {showAdminDashboard && (
              <section className="admin-dashboard rounded-3xl border border-[#ded6fb] bg-white p-8 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e0f4] pb-7">
                  <div>
                    <h3 className="workspace-heading text-2xl font-bold text-[#2c2455]">
                      Admin dashboard
                    </h3>
                    <p className="mt-1 text-sm text-[#5c5385]">
                      Review applications and monitor active support.
                    </p>
                  </div>
                </div>

                {isAdminLoading && (
                  <p className="mt-4 text-sm text-[#5c5385]">
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
                    <article className="rounded-2xl border border-[#e5e0f4] bg-[#f7f4ff] p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6d57b8]">
                        Active volunteers
                      </p>
                      <p className="mt-3 text-4xl font-extrabold text-[#2c2455]">
                        {adminMetrics.active_mentors}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-[#e5e0f4] bg-[#f7f4ff] p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6d57b8]">
                        Active caregivers
                      </p>
                      <p className="mt-3 text-4xl font-extrabold text-[#2c2455]">
                        {adminMetrics.active_mentees}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-[#e5e0f4] bg-[#f7f4ff] p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6d57b8]">
                        Current matches
                      </p>
                      <p className="mt-3 text-4xl font-extrabold text-[#2c2455]">
                        {adminMetrics.current_matches}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-[#e5e0f4] bg-[#f7f4ff] p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6d57b8]">
                        Volunteer hours
                      </p>
                      <p className="mt-3 text-4xl font-extrabold text-[#2c2455]">
                        {adminMetrics.volunteer_hours_total}
                      </p>
                    </article>
                  </div>
                )}

                <section className="admin-section mt-10 border-t border-[#e5e0f4] pt-9">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h4 className="text-2xl font-extrabold text-[#2c2455]">
                        All matches
                      </h4>
                      <p className="mt-2 text-base text-[#5c5385]">
                        Every volunteer and caregiver match, including pending and closed requests.
                      </p>
                    </div>
                    <label className="flex items-center gap-3 text-sm font-bold text-[#3f346c]">
                      Status
                      <select
                        value={adminMatchStatusFilter}
                        onChange={(event) =>
                          setAdminMatchStatusFilter(event.target.value)
                        }
                        className="rounded-xl border border-[#d7d2ea] bg-white px-3 py-2 text-sm outline-none ring-[#c9bff0] focus:border-[#7a63b7] focus:ring-2"
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
                    <p className="mt-5 rounded-xl border border-dashed border-[#d7d2ea] p-4 text-sm text-[#5c5385]">
                      No matches have this status.
                    </p>
                  ) : (
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#d7d2ea] text-xs font-bold uppercase tracking-[0.08em] text-[#6d57b8]">
                            <th className="px-3 py-3">Volunteer</th>
                            <th className="px-3 py-3">Caregiver</th>
                            <th className="px-3 py-3">Support requested</th>
                            <th className="px-3 py-3">Status</th>
                            <th className="px-3 py-3">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAdminMatches.map((match) => (
                            <tr key={match.id} className="border-b border-[#eeeaf8] text-[#4f4578]">
                              <td className="px-3 py-4 font-bold text-[#2c2455]">
                                {match.volunteer_profile?.full_name || "Unknown volunteer"}
                              </td>
                              <td className="px-3 py-4 font-bold text-[#2c2455]">
                                {match.caregiver_profile?.full_name || "Unknown caregiver"}
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

                <section className="admin-section mt-10 border-t border-[#e5e0f4] pt-9">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                    <h4 className="text-2xl font-extrabold text-[#2c2455]">
                      Volunteer-Caregiver session logs
                    </h4>
                    <p className="mt-2 text-base text-[#5c5385]">
                      Full session details across all volunteers and caregivers.
                    </p>
                    </div>
                    <p className="rounded-full bg-[#f0ecff] px-4 py-2 text-sm font-bold text-[#4a3c86]">
                      {adminSessionsTotal} total hours
                    </p>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <label
                      htmlFor="admin-session-mentor-filter"
                      className="text-xs font-bold uppercase tracking-[0.08em] text-[#6d57b8]"
                    >
                      Filter by volunteer
                    </label>
                    <select
                      id="admin-session-mentor-filter"
                      value={adminSessionMentorFilter}
                      onChange={(event) =>
                        setAdminSessionMentorFilter(event.target.value)
                      }
                      className="rounded-xl border border-[#d7d2ea] bg-white px-3 py-2 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
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
                    <p className="mt-3 text-sm text-[#5c5385]">
                      Loading session logs...
                    </p>
                  ) : filteredAdminSessionEntries.length === 0 ? (
                    <p className="mt-3 text-sm text-[#5c5385]">
                      No session logs match the selected volunteer.
                    </p>
                  ) : (
                    <div className="mt-6 divide-y divide-[#e5e0f4] border-y border-[#e5e0f4]">
                      {filteredAdminSessionEntries.slice(0, 20).map((entry) => (
                        <article
                          key={`admin-session-${entry.id}`}
                          className="grid gap-5 py-5 text-sm text-[#4f4578] md:grid-cols-[150px_1fr_1fr]"
                        >
                          <div>
                            <p className="request-label">Session</p>
                            <p className="mt-2 font-bold text-[#2c2455]">
                              {new Date(entry.meeting_date).toLocaleDateString()}
                            </p>
                            <p className="mt-1 text-lg font-extrabold text-[#6d57b8]">{entry.hours} hours</p>
                          </div>
                          <div>
                            <p className="request-label">Participants</p>
                            <p className="mt-2"><span className="font-bold">Volunteer:</span> {entry.mentor_profile?.full_name || "Unknown volunteer"}</p>
                            <p className="mt-1"><span className="font-bold">Caregiver:</span> {entry.mentee_profile?.full_name || "Unknown caregiver"}</p>
                            <p className="mt-1 text-xs text-[#5c5385]">Match #{entry.match_id}</p>
                          </div>
                          <div>
                            <p className="request-label">Session details</p>
                            <p className="mt-2 leading-6">{entry.topics_discussed || "No topics provided"}</p>
                            <p className={`mt-2 leading-6 ${entry.anything_to_flag ? "font-semibold text-[#8f2525]" : "text-[#5c5385]"}`}>
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

                <div className="admin-section mt-10 space-y-4 border-t border-[#e5e0f4] pt-9">
                  <h4 className="text-2xl font-extrabold text-[#2c2455]">
                    Pending applications
                  </h4>
                  {adminPendingUsers.length === 0 ? (
                    <article className="rounded-2xl border border-dashed border-[#d7d2ea] bg-white p-4">
                      <p className="text-sm text-[#5c5385]">
                        No pending requests right now.
                      </p>
                    </article>
                  ) : (
                    adminPendingUsers.map((user) => (
                      <article
                        key={user.id}
                        className="rounded-2xl border border-[#e5e0f4] bg-white p-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-bold text-[#2c2455]">
                              {user.full_name || "Unnamed user"}
                            </p>
                            <p className="text-sm text-[#5c5385]">
                              {user.role === "mentor" ? "Volunteer" : "Caregiver"} application - submitted{" "}
                              {new Date(user.created_at).toLocaleDateString()}
                            </p>
                            {user.bio && (
                              <p className="mt-2 text-sm text-[#4f4578]">
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
                              disabled={adminActionUserId === user.id}
                              className="rounded-full bg-[#2c2455] px-4 py-2 text-sm font-bold text-white transition enabled:hover:bg-[#201943] disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAdminRequestAction(user.id, "reject")
                              }
                              disabled={adminActionUserId === user.id}
                              className="rounded-full bg-[#fff2f2] px-4 py-2 text-sm font-bold text-[#9b2c2c] transition enabled:hover:bg-[#ffe3e3] disabled:cursor-not-allowed disabled:bg-slate-200"
                            >
                              Reject
                            </button>
                          </div>
                        </div>

                          <div className="mt-5 grid gap-4 border-t border-[#e5e0f4] pt-5 text-sm text-[#4f4578] md:grid-cols-2">
                            <p>
                              <span className="font-bold">Username:</span>{" "}
                              {user.username || "Not provided"}
                            </p>
                            <p>
                              <span className="font-bold">Role:</span>{" "}
                              {user.role === "mentor" ? "Volunteer" : "Caregiver"}
                            </p>

                            {user.role === "mentor" && (
                              <>
                                <p className="md:col-span-2">
                                  <span className="font-bold">Skills:</span>{" "}
                                  {(
                                    (Array.isArray(user.mentor_profiles)
                                      ? user.mentor_profiles[0]?.skills
                                      : user.mentor_profiles?.skills) ?? []
                                  ).join(", ") || "Not provided"}
                                </p>
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

                <div className="admin-section mt-10 space-y-4 border-t border-[#e5e0f4] pt-9">
                  <h4 className="text-2xl font-extrabold text-[#2c2455]">
                    Reviewed applications
                  </h4>
                  <p className="text-sm text-[#5c5385]">
                    View previously approved/rejected requests and update their
                    status.
                  </p>
                  {adminReviewedUsers.length === 0 ? (
                    <article className="rounded-2xl border border-dashed border-[#d7d2ea] bg-white p-4">
                      <p className="text-sm text-[#5c5385]">
                        No reviewed requests yet.
                      </p>
                    </article>
                  ) : (
                    adminReviewedUsers.map((user) => (
                      <article
                        key={`reviewed-${user.id}`}
                        className={`hover-lift rounded-2xl border bg-white p-4 ${
                          adminSelectedReviewedUser?.id === user.id
                            ? "border-[#7a63b7] ring-2 ring-[#d5cbf4]"
                            : "border-[#e5e0f4]"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-bold text-[#2c2455]">
                              {user.full_name || "Unnamed user"}
                            </p>
                            <p className="text-sm text-[#5c5385]">
                              {user.role === "mentor" ? "Volunteer" : "Caregiver"} - {user.approval_status} - submitted{" "}
                              {new Date(user.created_at).toLocaleDateString()}
                            </p>
                            {user.bio && (
                              <p className="mt-2 text-sm text-[#4f4578]">
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
                                className="rounded-full bg-[#fff2f2] px-4 py-2 text-sm font-bold text-[#9b2c2c] transition enabled:hover:bg-[#ffe3e3] disabled:cursor-not-allowed disabled:bg-slate-200"
                              >
                                Revoke approval
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAdminRequestAction(user.id, "approve")
                                }
                                disabled={adminActionUserId === user.id}
                                className="rounded-full bg-[#2c2455] px-4 py-2 text-sm font-bold text-white transition enabled:hover:bg-[#201943] disabled:cursor-not-allowed disabled:bg-slate-300"
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
                              className="rounded-full bg-[#f0ecff] px-3 py-2 text-sm font-bold text-[#4a3c86] hover:bg-[#e0d8fb]"
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
                          <div className="mt-4 rounded-xl bg-[#f7f4ff] p-3 text-sm text-[#4f4578]">
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

                            {user.role === "mentor" && (
                              <>
                                <p>
                                  <span className="font-bold">Skills:</span>{" "}
                                  {(
                                    (Array.isArray(user.mentor_profiles)
                                      ? user.mentor_profiles[0]?.skills
                                      : user.mentor_profiles?.skills) ?? []
                                  ).join(", ") || "Not provided"}
                                </p>
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

                <div className="admin-section mt-10 border-t border-[#e5e0f4] pt-9">
                  <h4 className="text-2xl font-extrabold text-[#2c2455]">
                    Volunteer profiles
                  </h4>
                  <p className="mt-1 text-sm text-[#5c5385]">
                    Click a volunteer row to view their profile and caregiver
                    requests.
                  </p>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      {adminMentors.length === 0 ? (
                        <article className="rounded-2xl border border-dashed border-[#d7d2ea] bg-white p-4">
                          <p className="text-sm text-[#5c5385]">
                            No approved volunteers found.
                          </p>
                        </article>
                      ) : (
                        adminMentors.map((mentor) => (
                          <button
                            key={mentor.id}
                            type="button"
                            onClick={() => loadAdminMentorDetails(mentor.id)}
                            className={`hover-lift w-full rounded-2xl border bg-white p-4 text-left ${
                              adminSelectedMentor?.id === mentor.id
                                ? "border-[#7a63b7] ring-2 ring-[#d5cbf4]"
                                : "border-[#e5e0f4]"
                            }`}
                          >
                            <p className="text-base font-bold text-[#2c2455]">
                              {mentor.full_name || "Unnamed volunteer"}
                            </p>
                            <p className="mt-1 text-sm text-[#5c5385]">
                              Visibility:{" "}
                              {mentor.is_visible ? "Visible" : "Hidden"}
                            </p>
                            {mentor.bio && (
                              <p className="mt-2 text-sm text-[#4f4578] line-clamp-2">
                                {mentor.bio}
                              </p>
                            )}
                          </button>
                        ))
                      )}
                    </div>

                    <section className="rounded-2xl border border-[#e5e0f4] bg-white p-4">
                      <h5 className="text-base font-bold text-[#2c2455]">
                        Volunteer details
                      </h5>
                      {isLoadingAdminMentorDetails && (
                        <p className="mt-3 text-sm text-[#5c5385]">
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
                          <p className="mt-3 text-sm text-[#5c5385]">
                            Select a volunteer to view their profile and requests.
                          </p>
                        )}

                      {adminSelectedMentor && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <p className="text-sm font-bold text-[#2c2455]">
                              {adminSelectedMentor.full_name ||
                                "Unnamed volunteer"}
                            </p>
                            <p className="text-sm text-[#5c5385]">
                              Status: {adminSelectedMentor.approval_status} -{" "}
                              {adminSelectedMentor.is_visible
                                ? "Visible"
                                : "Hidden"}
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
                              className="rounded-full bg-[#fff2f2] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#9b2c2c] transition enabled:hover:bg-[#ffe3e3] disabled:cursor-not-allowed disabled:bg-slate-200"
                            >
                              {adminActionUserId === adminSelectedMentor.id
                                ? "Removing..."
                                : "Remove volunteer listing + access"}
                            </button>
                          </div>
                          <p className="text-sm text-[#4f4578]">
                            {adminSelectedMentor.bio || "No bio provided."}
                          </p>
                          <p className="text-sm text-[#4f4578]">
                            <span className="font-bold">Skills:</span>{" "}
                            {(
                              (Array.isArray(
                                adminSelectedMentor.mentor_profiles,
                              )
                                ? adminSelectedMentor.mentor_profiles[0]?.skills
                                : adminSelectedMentor.mentor_profiles
                                    ?.skills) ?? []
                            ).join(", ") || "Not set"}
                          </p>
                          <p className="text-sm text-[#4f4578]">
                            <span className="font-bold">Availability:</span>{" "}
                            {(Array.isArray(adminSelectedMentor.mentor_profiles)
                              ? adminSelectedMentor.mentor_profiles[0]
                                  ?.availability
                              : adminSelectedMentor.mentor_profiles
                                  ?.availability) || "Not set"}
                          </p>

                          <div className="pt-2">
                            <p className="text-sm font-bold text-[#2c2455]">
                              Caregiver requests
                            </p>
                            {adminSelectedMentorRequests.length === 0 ? (
                              <p className="mt-1 text-sm text-[#5c5385]">
                                No requests for this volunteer yet.
                              </p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {adminSelectedMentorRequests.map((request) => (
                                  <article
                                    key={request.id}
                                    className="rounded-xl bg-[#f7f4ff] p-3"
                                  >
                                    <p className="text-sm font-bold text-[#2c2455]">
                                      {request.mentee_profile?.full_name ||
                                        "Unnamed caregiver"}
                                    </p>
                                    <p className="text-xs text-[#5c5385]">
                                      {request.status} -{" "}
                                      {new Date(
                                        request.created_at,
                                      ).toLocaleDateString()}
                                    </p>
                                    {request.mentee_profile?.bio && (
                                      <p className="mt-1 text-sm text-[#4f4578]">
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
              </section>
            )}

            {(showMenteeExperience || showMentorDirectory) && (
              <>
                <section className="rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="workspace-heading text-2xl font-bold text-[#2c2455]">
                        {showMentorDirectory
                          ? "All volunteers"
                          : "Browse volunteers"}
                      </h3>
                      <p className="mt-1 text-sm text-[#5c5385]">
                        {showMentorDirectory
                          ? "Preview every approved volunteer currently visible in the directory."
                          : "Select one volunteer to request a match."}
                      </p>
                    </div>
                    <p className="rounded-full bg-[#f0ecff] px-4 py-2 text-xs font-bold text-[#4a3c86]">
                      {filteredVolunteers.length} of {volunteers.length} volunteers
                    </p>
                  </div>
                  {isLoadingVolunteers && (
                    <p className="mt-3 text-sm text-[#5c5385]">
                      Loading volunteers from backend...
                    </p>
                  )}
                  {volunteerLoadError && (
                    <p className="mt-3 text-sm font-medium text-red-700">
                      {volunteerLoadError}
                    </p>
                  )}

                  <div className="mt-5 grid gap-3 lg:grid-cols-3">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by name, city, language, specialty..."
                      className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                    />
                    <select
                      value={availabilityFilter}
                      onChange={(event) =>
                        setAvailabilityFilter(event.target.value)
                      }
                      className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                    >
                      <option value="all">All availability</option>
                      {availabilityOptions.map((availability) => (
                        <option key={availability} value={availability}>
                          {availability}
                        </option>
                      ))}
                    </select>
                    <select
                      value={specialtyFilter}
                      onChange={(event) =>
                        setSpecialtyFilter(event.target.value)
                      }
                      className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                    >
                      <option value="all">All specialties</option>
                      {specialtyOptions.map((specialty) => (
                        <option key={specialty} value={specialty}>
                          {specialty}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  {filteredVolunteers.map((volunteer) => {
                    const isSelected = volunteer.id === selectedVolunteerId;
                    return (
                      <article
                        key={volunteer.id}
                        className={`hover-lift rounded-3xl border bg-white p-5 shadow-sm transition ${
                          isSelected
                            ? "border-[#7a63b7] ring-2 ring-[#d5cbf4]"
                            : "border-[#e5e0f4] hover:border-[#ad9adf]"
                        }`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-lg font-bold text-[#2c2455]">
                              {volunteer.name}
                            </h4>
                            <p className="text-sm text-[#5c5385]">
                              {volunteer.pronouns} | {volunteer.city}
                            </p>
                          </div>
                          {showMenteeExperience && isSelected && (
                            <span className="rounded-full bg-[#7a63b7] px-3 py-1 text-xs font-bold text-white">
                              Selected
                            </span>
                          )}
                        </div>

                        <p className="mb-4 text-sm leading-6 text-[#4f4578]">
                          {volunteer.bio}
                        </p>

                        <div className="mb-3 flex flex-wrap gap-2">
                          {volunteer.languages.map((language) => (
                            <Pill key={`${volunteer.id}-lang-${language}`}>
                              {language}
                            </Pill>
                          ))}
                        </div>

                        <div className="mb-4 flex flex-wrap gap-2">
                          {volunteer.focus.map((focus) => (
                            <Pill key={`${volunteer.id}-focus-${focus}`}>
                              {focus}
                            </Pill>
                          ))}
                        </div>

                        <p className="mb-4 text-sm text-[#4f4578]">
                          <span className="font-bold">Availability:</span>{" "}
                          {volunteer.availability}
                        </p>

                        {showMenteeExperience && (
                          <button
                            type="button"
                            onClick={() => handleSelectVolunteer(volunteer.id)}
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                              isSelected
                                ? "bg-[#f0ecff] text-[#4a3c86] hover:bg-[#e0d8fb]"
                                : "bg-[#7a63b7] text-white hover:bg-[#654ea5]"
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
                    <article className="rounded-3xl border border-dashed border-[#d7d2ea] bg-white p-6 md:col-span-2">
                      <h4 className="text-lg font-bold text-[#2c2455]">
                        No volunteers match this filter
                      </h4>
                      <p className="mt-2 text-sm text-[#5c5385]">
                        Try clearing your search, changing filters, or checking
                        your backend token and volunteer visibility settings.
                      </p>
                    </article>
                  )}
                </section>

                {isApprovedMentee && (
                  <section className="rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="workspace-heading text-2xl font-bold text-[#2c2455]">
                          Your sent requests
                        </h3>
                        <p className="mt-1 text-sm text-[#5c5385]">
                          Track all volunteer requests you have submitted.
                        </p>
                      </div>
                    </div>

                    {isLoadingMenteeRequests && (
                      <p className="mt-4 text-sm text-[#5c5385]">
                        Loading your requests...
                      </p>
                    )}
                    {menteeRequestsError && (
                      <p className="mt-4 text-sm font-medium text-red-700">
                        {menteeRequestsError}
                      </p>
                    )}

                    {!isLoadingMenteeRequests && menteeRequests.length === 0 && (
                      <article className="mt-4 rounded-2xl border border-dashed border-[#d7d2ea] bg-white p-4">
                        <p className="text-sm text-[#5c5385]">
                          You have not sent any requests yet.
                        </p>
                      </article>
                    )}

                    <div className="mt-4 space-y-3">
                      {menteeRequests.map((request) => (
                        <article
                          key={request.id}
                          className="rounded-2xl border border-[#e5e0f4] bg-white p-4"
                        >
                          <p className="text-base font-bold text-[#2c2455]">
                            {request.mentor_profile?.full_name || "Unknown volunteer"}
                          </p>
                          <p className="text-sm text-[#5c5385]">
                            Status: {request.status} - Sent{" "}
                            {new Date(request.created_at).toLocaleDateString()}
                          </p>
                          {request.status === "active" && request.mentor_email && (
                            <p className="mt-1 text-sm text-[#4f4578]">
                              <span className="font-bold">Volunteer email:</span>{" "}
                              {request.mentor_email}
                            </p>
                          )}
                          {request.mentor_profile?.bio && (
                            <p className="mt-2 text-sm text-[#4f4578]">
                              {request.mentor_profile.bio}
                            </p>
                          )}
                          {request.status === "declined" && (
                            <div className="mt-3 rounded-xl border border-[#f1cccc] bg-[#fff5f5] p-3">
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
                  <section className="sticky bottom-4 rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-lg">
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-sm text-[#5c5385]">
                          Current selection
                        </p>
                        <p className="text-lg font-bold text-[#2c2455]">
                          {selectedVolunteer.name} ({selectedVolunteer.city})
                        </p>
                      </div>

                      {selectedVolunteer && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="care-type"
                              className="text-sm font-bold text-[#3f346c]"
                            >
                              Type of care needed
                            </label>
                            <select
                              id="care-type"
                              value={careType}
                              onChange={(event) =>
                                setCareType(event.target.value)
                              }
                              className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
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
                              <option value="Young caregiver support">
                                Young caregiver support
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
                        className="rounded-full bg-[#7a63b7] px-5 py-3 text-sm font-bold text-white transition enabled:hover:bg-[#654ea5] disabled:cursor-not-allowed disabled:bg-slate-300"
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
          <section className="rounded-3xl border border-[#ded6fb] bg-white p-8 shadow-sm">
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-[#6d57b8]">
              Request Sent
            </p>
            <h3 className="text-2xl font-bold text-[#2c2455]">
              Your request was sent to {selectedVolunteer.name}.
            </h3>
            <p className="mt-3 max-w-3xl text-[#4f4578]">
              Thank you for submitting your request. The volunteer can now accept
              or decline it. You will receive an email when the status changes.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl bg-[#f7f4ff] p-4">
                <h4 className="mb-3 text-sm font-extrabold uppercase tracking-[0.08em] text-[#6d57b8]">
                  Requested Volunteer
                </h4>
                <p className="text-sm text-[#4f4578]">
                  <span className="font-bold">Volunteer:</span>{" "}
                  {selectedVolunteer.name}
                </p>
                <p className="text-sm text-[#4f4578]">
                  <span className="font-bold">Location:</span>{" "}
                  {selectedVolunteer.city}
                </p>
                <p className="text-sm text-[#4f4578]">
                  <span className="font-bold">Availability:</span>{" "}
                  {selectedVolunteer.availability}
                </p>
              </section>

              <section className="rounded-2xl bg-[#f7f4ff] p-4">
                <h4 className="mb-3 text-sm font-extrabold uppercase tracking-[0.08em] text-[#6d57b8]">
                  Your Application
                </h4>
                <p className="text-sm text-[#4f4578]">
                  <span className="font-bold">Care type needed:</span>{" "}
                  {careType}
                </p>
              </section>
            </div>

            <button
              type="button"
              onClick={handleRequestAnotherMentor}
              className="mt-6 rounded-full bg-[#2c2455] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#201943]"
            >
              View request status
            </button>
          </section>
        )}

        {isUnlocked && isSettingsOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
            <section className="pop-in max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[#ded6fb] bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-2xl font-bold text-[#2c2455]">
                    Settings
                  </h3>
                  <p className="mt-1 text-sm text-[#5c5385]">
                    Update your profile details and preferences.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="rounded-full bg-[#f0ecff] px-3 py-1 text-sm font-bold text-[#4a3c86]"
                >
                  Close
                </button>
              </div>

              {profileData?.profile?.role && (
                <p className="mt-4 inline-flex rounded-full bg-[#f0ecff] px-4 py-2 text-xs font-bold text-[#4a3c86]">
                  {profileData.profile.role} -{" "}
                  {profileData.profile.approval_status}
                </p>
              )}

              {isProfileLoading && (
                <p className="mt-4 text-sm text-[#5c5385]">
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
                      className="text-sm font-bold text-[#3f346c]"
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
                      className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="profile-full-name"
                      className="text-sm font-bold text-[#3f346c]"
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
                      className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="profile-picture-url"
                      className="text-sm font-bold text-[#3f346c]"
                    >
                      Profile picture URL
                    </label>
                    <input
                      id="profile-picture-url"
                      type="url"
                      value={profileForm.profilePictureUrl}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          profilePictureUrl: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-col gap-2">
                    <label
                      htmlFor="profile-bio"
                      className="text-sm font-bold text-[#3f346c]"
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
                      className="resize-y rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                    />
                  </div>

                  {userRole === "mentor" && (
                    <>
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="profile-skills"
                          className="text-sm font-bold text-[#3f346c]"
                        >
                          Skills (comma-separated)
                        </label>
                        <input
                          id="profile-skills"
                          type="text"
                          value={profileForm.skills}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              skills: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="profile-mentor-mode"
                          className="text-sm font-bold text-[#3f346c]"
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
                          className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                        >
                          <option value="Remote">Remote</option>
                          <option value="In person">In person</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="profile-availability"
                          className="text-sm font-bold text-[#3f346c]"
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
                          className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
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
                          className="h-4 w-4 rounded border-[#d7d2ea] text-[#7a63b7] focus:ring-[#7a63b7]"
                        />
                        <label
                          htmlFor="profile-visible"
                          className="text-sm font-bold text-[#3f346c]"
                        >
                          Accepting new caregiver matches
                        </label>
                      </div>
                    </>
                  )}

                  {userRole === "mentee" && (
                    <>
                      <div className="md:col-span-2 flex flex-col gap-2">
                        <label
                          htmlFor="profile-goals"
                          className="text-sm font-bold text-[#3f346c]"
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
                          className="resize-y rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
                        />
                      </div>
                      <div className="md:col-span-2 flex flex-col gap-2">
                        <label
                          htmlFor="profile-interests"
                          className="text-sm font-bold text-[#3f346c]"
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
                          className="rounded-xl border border-[#d7d2ea] px-4 py-3 text-sm outline-none ring-[#c9bff0] transition focus:border-[#7a63b7] focus:ring-2"
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
                className="mt-5 rounded-full bg-[#2c2455] px-5 py-3 text-sm font-bold text-white transition enabled:hover:bg-[#201943] disabled:cursor-not-allowed disabled:bg-slate-300"
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
