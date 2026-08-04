const { test, expect } = require("@playwright/test");

const CREATED_AT = "2026-08-04T12:00:00Z";
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function profileFor(role, approvalStatus, isSuperAdmin) {
  const names = {
    admin: isSuperAdmin ? "Jay Super Admin" : "Toronto Admin",
    mentor: "Morgan Volunteer",
    mentee: "Casey Caregiver",
  };
  return {
    id: `${role}-e2e`,
    role,
    username: `${role}_e2e`,
    full_name: names[role],
    bio: `E2E ${role} profile`,
    university: "University of Toronto",
    approval_status: approvalStatus,
    is_visible: role === "mentor" && approvalStatus === "approved",
    same_university_only: true,
    is_super_admin: isSuperAdmin,
    created_at: CREATED_AT,
  };
}

function roleProfileResponse(state) {
  return {
    profile: state.profile,
    mentor_profile:
      state.profile.role === "mentor"
        ? {
            id: state.profile.id,
            availability: "Hybrid :: Weekday evenings",
            total_hours: state.hourEntries.reduce(
              (sum, entry) => sum + Number(entry.hours || 0),
              0,
            ),
          }
        : null,
    mentee_profile:
      state.profile.role === "mentee"
        ? {
            id: state.profile.id,
            goals: "Find practical peer support",
            interests: ["Hospital navigation", "Burnout prevention"],
          }
        : null,
  };
}

function authUser(state) {
  return {
    id: state.profile.id,
    aud: "authenticated",
    role: "authenticated",
    email: state.email,
    email_confirmed_at: CREATED_AT,
    confirmed_at: CREATED_AT,
    last_sign_in_at: CREATED_AT,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {
      role: state.profile.role,
      username: state.profile.username,
      full_name: state.profile.full_name,
      university: state.profile.university,
    },
    identities: [],
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

function sessionResponse(state) {
  return {
    access_token: `e2e-${state.profile.role}-access-token`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `e2e-${state.profile.role}-refresh-token`,
    user: authUser(state),
  };
}

async function installPortalMocks(
  page,
  {
    role = "mentee",
    approvalStatus = "approved",
    isSuperAdmin = false,
    university = "University of Toronto",
  } = {},
) {
  const torontoVolunteer = {
    id: "mentor-toronto",
    role: "mentor",
    username: "ava_toronto",
    full_name: "Ava Toronto",
    bio: "Peer support for caregivers balancing school and appointments.",
    university: "University of Toronto",
    approval_status: "approved",
    is_visible: true,
    same_university_only: true,
    is_super_admin: false,
    created_at: CREATED_AT,
    mentor_profiles: {
      availability: "Hybrid :: Weekday evenings",
      total_hours: 3,
    },
  };
  const waterlooVolunteer = {
    id: "mentor-waterloo",
    role: "mentor",
    username: "noah_waterloo",
    full_name: "Noah Waterloo",
    bio: "Remote peer support and appointment planning.",
    university: "University of Waterloo",
    approval_status: "approved",
    is_visible: true,
    same_university_only: false,
    is_super_admin: false,
    created_at: CREATED_AT,
    mentor_profiles: {
      availability: "Remote :: Weekends",
      total_hours: 1,
    },
  };
  const activeRequest = {
    id: 402,
    mentor_id: "mentor-e2e",
    mentee_id: "mentee-active",
    status: "active",
    care_type: "Hospital / appointment navigation",
    created_at: CREATED_AT,
    mentee_email: "alex.caregiver@example.com",
    mentee_profile: {
      id: "mentee-active",
      full_name: "Alex Active",
      bio: "Balancing classes and family appointments.",
      university: "University of Toronto",
    },
  };
  const pendingRequest = {
    id: 401,
    mentor_id: "mentor-e2e",
    mentee_id: "mentee-pending",
    status: "pending",
    care_type: "Mental health and emotional support",
    created_at: CREATED_AT,
    mentee_email: "pat.caregiver@example.com",
    mentee_profile: {
      id: "mentee-pending",
      full_name: "Pat Pending",
      bio: "Looking for someone who understands caregiving stress.",
      university: "University of Toronto",
    },
  };
  const pendingAdminUser = {
    id: "pending-caregiver",
    role: "mentee",
    username: "pending_caregiver",
    full_name: "Pending Caregiver",
    bio: "Application waiting for review.",
    university: "University of Toronto",
    approval_status: "pending",
    is_visible: false,
    same_university_only: true,
    is_super_admin: false,
    created_at: CREATED_AT,
    mentor_profiles: null,
    mentee_profiles: {
      goals: "Peer guidance",
      interests: ["Burnout prevention"],
    },
  };

  const state = {
    profile: profileFor(role, approvalStatus, isSuperAdmin),
    email: `${role}@e2e.example.com`,
    mentors: [torontoVolunteer, waterlooVolunteer],
    menteeRequests: [],
    mentorRequests: [pendingRequest, activeRequest],
    hourEntries: [],
    pendingAdminUsers: [pendingAdminUser],
    reviewedAdminUsers: [torontoVolunteer],
    adminUsers: [pendingAdminUser, torontoVolunteer],
    preapprovedEmails: [],
    lastMatchRequest: null,
    lastHourEntry: null,
    lastSyncPayload: null,
    runtimeErrors: [],
    unhandledRoutes: [],
  };
  state.profile.university = university;

  page.on("console", (message) => {
    if (message.type() === "error") {
      state.runtimeErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    state.runtimeErrors.push(error.message);
  });

  await page.route("**/auth/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    if (url.pathname.endsWith("/signup")) {
      const body = request.postDataJSON();
      const metadata = body.data || {};
      state.email = body.email;
      state.profile = {
        ...state.profile,
        role: metadata.role === "mentor" ? "mentor" : "mentee",
        username: metadata.username,
        full_name: metadata.full_name,
        bio: metadata.bio,
        university: metadata.university,
        approval_status: "pending",
        is_visible: false,
      };
      await fulfillJson(route, sessionResponse(state));
      return;
    }

    if (url.pathname.endsWith("/token")) {
      const body = request.postDataJSON();
      state.email = body.email || state.email;
      await fulfillJson(route, sessionResponse(state));
      return;
    }

    if (url.pathname.endsWith("/user")) {
      await fulfillJson(route, authUser(state));
      return;
    }

    if (url.pathname.endsWith("/logout")) {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    await fulfillJson(route, {});
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    if (path === "/api/auth/me" && method === "GET") {
      await fulfillJson(route, roleProfileResponse(state));
      return;
    }

    if (path === "/api/auth/me" && method === "PATCH") {
      const body = request.postDataJSON();
      state.profile = {
        ...state.profile,
        username: body.username ?? state.profile.username,
        full_name: body.full_name ?? state.profile.full_name,
        bio: body.bio ?? state.profile.bio,
        university: body.university ?? state.profile.university,
        is_visible: body.is_visible ?? state.profile.is_visible,
        same_university_only:
          body.same_university_only ?? state.profile.same_university_only,
      };
      await fulfillJson(route, roleProfileResponse(state));
      return;
    }

    if (path === "/api/auth/sync-profile" && method === "POST") {
      const body = request.postDataJSON();
      state.lastSyncPayload = body;
      state.profile = {
        ...state.profile,
        role: body.role || state.profile.role,
        username: body.username || state.profile.username,
        full_name: body.full_name || state.profile.full_name,
        bio: body.bio ?? state.profile.bio,
        university: body.university || state.profile.university,
        approval_status: "pending",
        is_visible: false,
      };
      await fulfillJson(route, roleProfileResponse(state));
      return;
    }

    if (path === "/api/matches/mentors/available" && method === "GET") {
      const includeOther =
        url.searchParams.get("include_other_universities") === "true";
      await fulfillJson(route, {
        mentors: includeOther ? state.mentors : [state.mentors[0]],
      });
      return;
    }

    if (path === "/api/matches/my-requests" && method === "GET") {
      await fulfillJson(route, { requests: state.menteeRequests });
      return;
    }

    if (path === "/api/matches/requests" && method === "POST") {
      const body = request.postDataJSON();
      state.lastMatchRequest = body;
      const mentor = state.mentors.find((item) => item.id === body.mentor_id);
      const created = {
        id: 501,
        mentor_id: body.mentor_id,
        mentee_id: state.profile.id,
        status: "pending",
        care_type: body.care_type,
        created_at: CREATED_AT,
        mentor_email: null,
        mentor_profile: mentor,
      };
      state.menteeRequests.push(created);
      await fulfillJson(route, { message: "Request created.", match: created }, 201);
      return;
    }

    if (path === "/api/matches/mentor-requests" && method === "GET") {
      await fulfillJson(route, { requests: state.mentorRequests });
      return;
    }

    if (path.startsWith("/api/matches/mentor-requests/") && method === "GET") {
      await fulfillJson(route, {
        mentor: state.mentors[0],
        requests: state.mentorRequests,
      });
      return;
    }

    if (path.endsWith("/mentor-decision") && method === "POST") {
      const matchId = Number(path.split("/")[3]);
      const body = request.postDataJSON();
      const requestRow = state.mentorRequests.find((item) => item.id === matchId);
      if (requestRow) {
        requestRow.status = body.decision === "accept" ? "active" : "declined";
      }
      await fulfillJson(route, { message: "Decision saved." });
      return;
    }

    if (path === "/api/volunteer-hours" && method === "GET") {
      await fulfillJson(route, {
        entries: state.hourEntries,
        total_hours: state.hourEntries.reduce(
          (sum, entry) => sum + Number(entry.hours || 0),
          0,
        ),
      });
      return;
    }

    if (path === "/api/volunteer-hours" && method === "POST") {
      const body = request.postDataJSON();
      const entry = {
        id: 601,
        mentor_id: state.profile.id,
        mentee_id: "mentee-active",
        ...body,
      };
      state.lastHourEntry = entry;
      state.hourEntries.push(entry);
      await fulfillJson(route, { message: "Hours logged.", entry }, 201);
      return;
    }

    if (path === "/api/admin/pending-users" && method === "GET") {
      await fulfillJson(route, {
        pending_users: state.pendingAdminUsers.filter(
          (user) => user.approval_status === "pending",
        ),
      });
      return;
    }

    if (path === "/api/admin/reviewed-users" && method === "GET") {
      await fulfillJson(route, {
        reviewed_users: [
          ...state.reviewedAdminUsers,
          ...state.pendingAdminUsers.filter(
            (user) => user.approval_status !== "pending",
          ),
        ],
      });
      return;
    }

    if (path === "/api/admin/dashboard" && method === "GET") {
      await fulfillJson(route, {
        active_mentors: 1,
        active_mentees: 1,
        current_matches: 1,
        volunteer_hours_total: 2.5,
      });
      return;
    }

    if (path === "/api/admin/mentors" && method === "GET") {
      await fulfillJson(route, { mentors: [state.mentors[0]] });
      return;
    }

    if (path === "/api/admin/matches" && method === "GET") {
      await fulfillJson(route, {
        matches: [
          {
            id: 700,
            mentor_id: state.mentors[0].id,
            mentee_id: "mentee-active",
            status: "active",
            care_type: "General caregiving guidance",
            created_at: CREATED_AT,
            volunteer_profile: state.mentors[0],
            caregiver_profile: activeRequest.mentee_profile,
          },
        ],
        status_counts: { active: 1 },
      });
      return;
    }

    if (path === "/api/admin/users" && method === "GET") {
      await fulfillJson(route, { users: state.adminUsers });
      return;
    }

    if (path === "/api/admin/users" && method === "POST") {
      const body = request.postDataJSON();
      const created = {
        id: `created-${state.adminUsers.length + 1}`,
        role: body.role,
        username: body.username,
        full_name: body.full_name,
        bio: body.bio,
        university: body.university,
        approval_status: body.role === "admin" ? "approved" : body.approval_status,
        is_visible: Boolean(body.is_visible),
        same_university_only: body.same_university_only !== false,
        is_super_admin: false,
        created_at: CREATED_AT,
        mentor_profiles: null,
        mentee_profiles: null,
      };
      state.adminUsers.push(created);
      await fulfillJson(route, {
        message: "Account and profile created.",
        profile: created,
      });
      return;
    }

    if (/^\/api\/admin\/users\/[^/]+\/(approve|reject)$/.test(path) && method === "POST") {
      const userId = path.split("/")[4];
      const action = path.split("/")[5];
      const target = state.pendingAdminUsers.find((user) => user.id === userId);
      if (target) {
        target.approval_status = action === "approve" ? "approved" : "rejected";
      }
      await fulfillJson(route, { message: `${action} complete.` });
      return;
    }

    if (path === "/api/admin/preapproved-emails" && method === "GET") {
      await fulfillJson(route, {
        preapproved_emails: state.preapprovedEmails,
      });
      return;
    }

    if (path === "/api/admin/preapproved-emails" && method === "POST") {
      const body = request.postDataJSON();
      state.preapprovedEmails.push({
        id: `invite-${state.preapprovedEmails.length + 1}`,
        ...body,
        claimed_at: null,
        created_at: CREATED_AT,
      });
      await fulfillJson(route, {
        message: "Email preapproved.",
        preapproved_email: state.preapprovedEmails.at(-1),
      });
      return;
    }

    if (path.startsWith("/api/admin/preapproved-emails/") && method === "DELETE") {
      const id = path.split("/").at(-1);
      state.preapprovedEmails = state.preapprovedEmails.filter(
        (entry) => entry.id !== id,
      );
      await fulfillJson(route, { message: "Preapproved email removed." });
      return;
    }

    state.unhandledRoutes.push(`${method} ${path}`);
    await fulfillJson(
      route,
      { detail: `Unhandled E2E route: ${method} ${path}` },
      404,
    );
  });

  return state;
}

async function signIn(page, state) {
  await page.goto("/");
  await page.locator("header").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(state.email);
  await page.getByLabel("Password", { exact: true }).fill("E2ePassword123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open profile menu", exact: true }),
  ).toBeVisible();
}

async function expectHealthyPage(page, state) {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1);
  expect(state.unhandledRoutes).toEqual([]);
  expect(state.runtimeErrors).toEqual([]);
}

test("landing page and signup initialize a university-tagged pending profile", async ({ page }) => {
  const state = await installPortalMocks(page, {
    role: "mentee",
    approvalStatus: "pending",
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Care for the people who care for others." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Find peer support" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  await page.getByLabel("I am signing up as").selectOption("mentor");
  await expect(page.getByLabel("Support format")).toBeVisible();
  await expect(page.getByLabel("Support format").locator('option[value="Hybrid"]')).toHaveCount(1);
  await expect(page.getByLabel("Skills")).toHaveCount(0);
  await page.getByLabel("I am signing up as").selectOption("mentee");

  await page.getByLabel("Email", { exact: true }).fill("new.caregiver@example.com");
  await page.getByLabel("Password", { exact: true }).fill("E2ePassword123!");
  await page.getByLabel("Username", { exact: true }).fill("new_caregiver");
  await page.getByLabel("Full name", { exact: true }).fill("New Caregiver");
  await page.getByLabel("Ontario university").selectOption("University of Toronto");
  await page.getByLabel("Goals").fill("Find peer support close to campus");
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  await expect(page.getByText("Account pending", { exact: true })).toBeVisible();
  await expect(page.getByText("waiting for admin approval", { exact: false })).toBeVisible();
  expect(state.lastSyncPayload.university).toBe("University of Toronto");
  expect(state.lastSyncPayload.role).toBe("mentee");
  await expectHealthyPage(page, state);
});

test("caregiver browses across universities and sends one match request", async ({ page }) => {
  const state = await installPortalMocks(page, { role: "mentee" });
  await signIn(page, state);

  await expect(page.getByRole("heading", { name: "Browse volunteers" })).toBeVisible();
  await expect(page.getByText("Ava Toronto", { exact: true })).toBeVisible();
  await expect(page.getByText("Noah Waterloo", { exact: true })).toHaveCount(0);

  await page
    .getByLabel("Include volunteers from other Ontario universities")
    .check();
  await expect(page.getByText("Noah Waterloo", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "University", exact: true })
    .selectOption("University of Waterloo");
  await expect(page.getByText("Ava Toronto", { exact: true })).toHaveCount(0);

  const volunteerCard = page.locator("article").filter({ hasText: "Noah Waterloo" });
  await volunteerCard.getByRole("button", { name: "Select volunteer" }).click();
  const careType = page.getByLabel("Type of care needed");
  await expect(careType).not.toContainText("Young caregiver support");
  await careType.selectOption("General caregiving guidance");
  await page.getByRole("button", { name: "Send match request" }).click();

  await expect(page.getByText("Request Sent", { exact: true })).toBeVisible();
  await expect(page.getByText("Your request was sent to Noah Waterloo.")).toBeVisible();
  expect(state.lastMatchRequest).toEqual({
    mentor_id: "mentor-waterloo",
    care_type: "General caregiving guidance",
  });

  await page.getByRole("button", { name: "View request status" }).click();
  await expect(page.getByRole("heading", { name: "Your sent requests" })).toBeVisible();
  await expect(page.getByText("Status: pending", { exact: false })).toBeVisible();
  await expectHealthyPage(page, state);
});

test("volunteer accepts requests and logs hours with topics and flags", async ({ page }) => {
  const state = await installPortalMocks(page, { role: "mentor" });
  await signIn(page, state);

  await expect(page.getByRole("heading", { name: "Caregiver requests" })).toBeVisible();
  const pendingCard = page.locator("article.request-record").filter({ hasText: "Pat Pending" });
  await pendingCard.getByRole("button", { name: "Accept request" }).click();
  await expect(page.getByText("Caregiver request accepted.")).toBeVisible();

  await page.getByRole("button", { name: "My caregivers" }).click();
  await expect(page.getByRole("heading", { name: "My caregivers" })).toBeVisible();
  await expect(page.getByText("Pat Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Alex Active", { exact: true })).toBeVisible();

  await page.getByLabel("Meeting date").fill("2026-08-04");
  await page.getByLabel("Hours").fill("1.5");
  await page.getByLabel("Next meeting").fill("2026-08-11T15:30");
  await page.getByLabel("Topics discussed").fill("Campus resources and respite planning");
  await page.getByLabel("Anything to flag").fill("Follow up on burnout concerns");
  await page.getByRole("button", { name: "Log volunteer hours" }).click();

  await expect(page.getByText("Volunteer hours logged.")).toBeVisible();
  await expect(page.getByText("Total logged hours: 1.5")).toBeVisible();
  await expect(page.getByText("Campus resources and respite planning")).toBeVisible();
  await expect(page.getByText("Follow up on burnout concerns")).toBeVisible();
  expect(state.lastHourEntry.topics_discussed).toBe(
    "Campus resources and respite planning",
  );
  expect(state.lastHourEntry.anything_to_flag).toBe(
    "Follow up on burnout concerns",
  );
  await expectHealthyPage(page, state);
});

test("normal admin is limited to one university while managing applications", async ({ page }) => {
  const state = await installPortalMocks(page, { role: "admin" });
  await signIn(page, state);

  await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
  await expect(page.getByText("University of Toronto workspace.")).toBeVisible();
  await expect(page.getByText("We couldn't load this information.")).toHaveCount(0);

  const inviteSection = page.locator("form").filter({
    has: page.getByRole("button", { name: "Preapprove", exact: true }),
  });
  const inviteUniversity = inviteSection.getByRole("combobox", {
    name: "University",
    exact: true,
  });
  await expect(inviteUniversity).toBeDisabled();
  await expect(inviteUniversity).toHaveValue("University of Toronto");
  await inviteSection.getByLabel("Email", { exact: true }).fill("approved@example.com");
  await inviteSection.getByRole("button", { name: "Preapprove" }).click();
  await expect(page.getByText("Email preapproved.", { exact: false })).toBeVisible();
  await expect(page.getByText("approved@example.com", { exact: true })).toBeVisible();

  const pendingApplication = page.locator("article").filter({ hasText: "Pending Caregiver" });
  await pendingApplication.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Request approved successfully.")).toBeVisible();

  const profileSection = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create account", exact: true }),
  });
  await expect(
    profileSection.getByRole("combobox", { name: "University", exact: true }),
  ).toBeDisabled();
  const normalAdminRole = profileSection.getByRole("combobox", {
    name: "Role",
    exact: true,
  });
  await expect(normalAdminRole).toBeVisible();
  await expect(
    normalAdminRole.locator('option[value="admin"]'),
  ).toHaveCount(0);
  await expectHealthyPage(page, state);
});

test("admin without a university sees a setup state instead of a failed dashboard", async ({ page }) => {
  const state = await installPortalMocks(page, {
    role: "admin",
    university: "University not selected",
  });
  await signIn(page, state);

  await expect(
    page.getByRole("heading", { name: "University assignment required" }),
  ).toBeVisible();
  await expect(page.getByText("cannot access applications", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preapproved signup emails" }),
  ).toHaveCount(0);
  await expect(page.getByText("We couldn't load this information.")).toHaveCount(0);
  await expectHealthyPage(page, state);
});

test("super-admin can choose universities and create normal admin accounts", async ({ page }) => {
  const state = await installPortalMocks(page, {
    role: "admin",
    isSuperAdmin: true,
  });
  await signIn(page, state);

  await expect(
    page.getByText("Super-admin workspace across all Ontario universities."),
  ).toBeVisible();
  const profileSection = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create account", exact: true }),
  });
  const university = profileSection.getByRole("combobox", {
    name: "University",
    exact: true,
  });
  await expect(university).toBeEnabled();
  const role = profileSection.getByRole("combobox", {
    name: "Role",
    exact: true,
  });
  await expect(role.locator('option[value="admin"]')).toHaveCount(1);

  await profileSection.getByRole("textbox", { name: "Login email" }).fill("new.admin@example.com");
  await profileSection.getByRole("textbox", { name: "Temporary password" }).fill("Temporary123!");
  await role.selectOption("admin");
  await profileSection.getByRole("textbox", { name: "Username", exact: true }).fill("new_admin");
  await profileSection.getByRole("textbox", { name: "Full name", exact: true }).fill("New University Admin");
  await university.selectOption("University of Waterloo");
  await profileSection.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Account and profile created.")).toBeVisible();
  await expect(page.getByText("New University Admin", { exact: true })).toBeVisible();
  const created = state.adminUsers.find((user) => user.username === "new_admin");
  expect(created.role).toBe("admin");
  expect(created.university).toBe("University of Waterloo");
  expect(created.is_super_admin).toBe(false);
  await expectHealthyPage(page, state);
});
