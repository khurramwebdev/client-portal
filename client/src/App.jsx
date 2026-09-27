import { useCallback, useEffect, useState } from "react";
import "./App.css";
import "./ClientFeatures.css";
import AdminPanel from "./AdminPanel.jsx";

const API_BASE = "http://localhost:5000/api";

const navigation = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "project", label: "Project", icon: "◇" },
  { id: "timeline", label: "Timeline", icon: "◷" },
  { id: "files", label: "Shared files", icon: "▤" },
  { id: "updates", label: "Updates", icon: "◉" },
];

function initialPage() {
  const requested = window.location.hash.replace("#", "");
  const allowed = navigation.map((item) => item.id);
  const storedUser = readStoredUser();

  if (storedUser?.role === "admin") allowed.push("manage");
  if (storedUser?.role === "client") allowed.push("messages");

  return allowed.includes(requested) ? requested : "overview";
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("clientPortalUser")) || null;
  } catch {
    return null;
  }
}

function getInitialProject() {
  try {
    return JSON.parse(localStorage.getItem("clientPortalProjectCache")) || null;
  } catch {
    return null;
  }
}

function getInitialProjects() {
  try {
    return JSON.parse(localStorage.getItem("clientPortalProjectsCache")) || [];
  } catch {
    return [];
  }
}

function formatDate(value) {
  if (!value) return "Date not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date not set";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("clientPortalToken") || ""
  );
  const [user, setUser] = useState(readStoredUser);
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [project, setProject] = useState(getInitialProject);
  const [projects, setProjects] = useState(getInitialProjects);
  const [isLoadingProject, setIsLoadingProject] = useState(
    !getInitialProject()
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const [activePage, setActivePage] = useState(initialPage);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadProjects = useCallback(
    async (background = false) => {
      if (!token) return;
      if (background) setIsRefreshing(true);

      try {
        const response = await fetch(API_BASE + "/projects", {
          headers: { Authorization: "Bearer " + token },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Could not load your project.");
        }

        const loadedProjects = data.projects || [];
        const savedProjectId = localStorage.getItem(
          "clientPortalSelectedProjectId"
        );
        const nextProject =
          loadedProjects.find((item) => item._id === savedProjectId) ||
          loadedProjects[0] ||
          null;

        setProjects(loadedProjects);
        localStorage.setItem(
          "clientPortalProjectsCache",
          JSON.stringify(loadedProjects)
        );
        setProject(nextProject);

        if (nextProject) {
          localStorage.setItem(
            "clientPortalProjectCache",
            JSON.stringify(nextProject)
          );
          localStorage.setItem(
            "clientPortalSelectedProjectId",
            nextProject._id
          );
        } else {
          localStorage.removeItem("clientPortalProjectCache");
          localStorage.removeItem("clientPortalSelectedProjectId");
        }

        setDashboardError("");
        setLastSynced(new Date());
      } catch (error) {
        setDashboardError(
          error.message || "Could not connect to the server."
        );
      } finally {
        setIsLoadingProject(false);
        setIsRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return undefined;

    loadProjects(false);

    const timer = window.setInterval(() => loadProjects(true), 60000);

    return () => window.clearInterval(timer);
  }, [token, loadProjects]);

  useEffect(() => {
    function syncPageFromHistory() {
      setActivePage(initialPage());
      setMobileMenuOpen(false);
    }

    window.addEventListener("popstate", syncPageFromHistory);

    return () => window.removeEventListener("popstate", syncPageFromHistory);
  }, []);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthNotice("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const registering = mode === "register";
    const body = {
      email: formData.get("email"),
      password: formData.get("password"),
    };

    if (registering) body.name = formData.get("name");

    try {
      const response = await fetch(
        API_BASE + "/auth/" + (registering ? "register" : "login"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setAuthNotice(
          data.message || "Please check your details and try again."
        );
        return;
      }

      localStorage.setItem("clientPortalToken", data.token);
      localStorage.setItem("clientPortalUser", JSON.stringify(data.user));
      localStorage.removeItem("clientPortalProjectCache");
      localStorage.removeItem("clientPortalProjectsCache");
      localStorage.removeItem("clientPortalSelectedProjectId");

      setUser(data.user);
      setProjects([]);
      setProject(null);
      setIsLoadingProject(true);
      setToken(data.token);
      setActivePage("overview");
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      setAuthNotice(
        "Could not connect to the server. Make sure it is running."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("clientPortalToken");
    localStorage.removeItem("clientPortalUser");
    localStorage.removeItem("clientPortalProjectCache");
    localStorage.removeItem("clientPortalProjectsCache");
    localStorage.removeItem("clientPortalSelectedProjectId");

    setToken("");
    setProjects([]);
    setUser(null);
    setProject(null);
    setLastSynced(null);
    setDashboardError("");
    setAuthNotice("");
    setActivePage("overview");
    window.history.replaceState(null, "", window.location.pathname);
    setMode("login");
  }

  function changePage(page) {
    setActivePage(page);
    window.history.pushState(null, "", "#" + page);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleProjectUpdated(updatedProject) {
    setProject(updatedProject);
    localStorage.setItem(
      "clientPortalProjectCache",
      JSON.stringify(updatedProject)
    );

    setProjects((current) => {
      const exists = current.some(
        (item) => item._id === updatedProject._id
      );
      const updatedProjects = exists
        ? current.map((item) =>
            item._id === updatedProject._id ? updatedProject : item
          )
        : [updatedProject, ...current];

      localStorage.setItem(
        "clientPortalProjectsCache",
        JSON.stringify(updatedProjects)
      );

      return updatedProjects;
    });
  }

  function selectClientProject(projectId) {
    const selectedProject = projects.find(
      (item) => item._id === projectId
    );

    if (!selectedProject) return;

    setProject(selectedProject);
    localStorage.setItem(
      "clientPortalProjectCache",
      JSON.stringify(selectedProject)
    );
    localStorage.setItem(
      "clientPortalSelectedProjectId",
      selectedProject._id
    );
  }

  if (!token) {
    return (
      <main className="login-page">
        <div
          className="login-ambient login-ambient-one"
          aria-hidden="true"
        />
        <div
          className="login-ambient login-ambient-two"
          aria-hidden="true"
        />

        <section className="welcome-panel">
          <a className="brand" href="#top" aria-label="ClientSpace home">
            <span className="brand-mark">C</span>
            <span>
              CLIENT<span className="brand-light">SPACE</span>
            </span>
          </a>

          <div className="welcome-copy">
            <span className="eyebrow">YOUR PROJECT, IN FOCUS</span>
            <h1>
              Everything
              <br />
              moving forward.
            </h1>
            <p>
              One calm space to follow your project, check shared files, and
              stay in touch with your team.
            </p>
          </div>

          <div className="welcome-footer">
            <span className="status-dot" /> A clearer view of what comes next
          </div>
        </section>

        <section className="form-panel">
          <form className="login-card" onSubmit={handleAuthSubmit}>
            <div className="login-card-content">
              <div className="mobile-brand">
                <span className="brand-mark">C</span>
                <span>
                  CLIENT<span className="brand-light">SPACE</span>
                </span>
              </div>

              <span className="eyebrow">CLIENT PORTAL</span>
              <h2>
                {mode === "register"
                  ? "Create your account"
                  : "Welcome back"}
              </h2>
              <p className="form-intro">
                {mode === "register"
                  ? "Create an account to access your project space."
                  : "Sign in to see how your project is progressing."}
              </p>

              {mode === "register" && (
                <label className="form-label" htmlFor="name">
                  Full name
                  <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="Your full name"
                    autoComplete="name"
                    required
                  />
                </label>
              )}

              <label className="form-label" htmlFor="email">
                Email address
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <div className="password-heading">
                <label className="form-label" htmlFor="password">
                  Password
                </label>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <input
                className="auth-input"
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={mode === "register" ? 8 : undefined}
                required
              />

              <button
                className="submit-button"
                type="submit"
                disabled={isSubmitting}
              >
                <span>
                  {isSubmitting
                    ? "Please wait..."
                    : mode === "register"
                    ? "Create account"
                    : "Sign in to your portal"}
                </span>
                <span aria-hidden="true">↗</span>
              </button>

              {authNotice && (
                <p className="form-notice" role="status">
                  {authNotice}
                </p>
              )}

              <p className="access-note">
                {mode === "register"
                  ? "Already have an account? "
                  : "Need access? "}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setMode(mode === "register" ? "login" : "register");
                    setAuthNotice("");
                  }}
                >
                  {mode === "register" ? "Sign in" : "Create an account"}
                </button>
              </p>
            </div>
          </form>
        </section>
      </main>
    );
  }

  const firstName = user?.name?.split(" ")[0] || "Client";
  const isAdmin = user?.role === "admin";
  const pageItems = isAdmin
    ? [...navigation, { id: "manage", label: "Manage projects", icon: "⚙" }]
    : [...navigation, { id: "messages", label: "Messages", icon: "✉" }];
  const completedCount =
    project?.milestones?.filter((item) => item.status === "Completed")
      .length || 0;
  const totalMilestones = project?.milestones?.length || 0;
  const progress = Number(project?.progress || 0);
  const milestoneProgress = totalMilestones
    ? Math.round((completedCount / totalMilestones) * 100)
    : 0;
  const milestoneItems = project?.milestones || [];
  const statusCounts = {
    completed: milestoneItems.filter(
      (item) => item.status === "Completed"
    ).length,
    active: milestoneItems.filter(
      (item) => item.status === "In Progress"
    ).length,
    pending: milestoneItems.filter(
      (item) => item.status === "Pending"
    ).length,
  };

  const activeLabel =
    pageItems.find((item) => item.id === activePage)?.label || "Overview";

  return (
    <main className="dashboard-shell">
      <aside
        className={
          "dashboard-sidebar" + (mobileMenuOpen ? " is-open" : "")
        }
      >
        <a
          className="brand dashboard-brand"
          href="#overview"
          onClick={(event) => {
            event.preventDefault();
            changePage("overview");
          }}
        >
          <span className="brand-mark">C</span>
          <span>
            CLIENT<span className="brand-light">SPACE</span>
          </span>
        </a>

        <div className="sidebar-workspace">
          <span className="sidebar-label">WORKSPACE</span>
          <nav
            className="dashboard-nav"
            aria-label="Dashboard navigation"
          >
            {pageItems.map((item) => (
              <button
                className={
                  "nav-item" +
                  (activePage === item.id ? " active" : "")
                }
                type="button"
                key={item.id}
                onClick={() => changePage(item.id)}
                aria-current={
                  activePage === item.id ? "page" : undefined
                }
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.id === "updates" &&
                  project?.updates?.length > 0 && (
                    <span className="nav-count">
                      {project.updates.length}
                    </span>
                  )}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="support-card">
            <span className="support-indicator" />
            <div>
              <strong>Project support</strong>
              <span>We’re here to help</span>
            </div>
          </div>

          <div className="sidebar-user">
            <span className="profile-avatar">
              {(user?.name || "C").charAt(0).toUpperCase()}
            </span>
            <span className="sidebar-user-name">
              {user?.name || "Client"}
              <small>
                {isAdmin ? "Administrator" : "Client account"}
              </small>
            </span>
            <button
              className="logout-button"
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              ↗
            </button>
          </div>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <button
            className="mobile-menu-button"
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-label={
              mobileMenuOpen ? "Close navigation" : "Open navigation"
            }
            onClick={() => setMobileMenuOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="topbar-title">
            <span className="topbar-caption">CLIENT WORKSPACE</span>
            <span className="breadcrumb">
              {activeLabel}
              <span>/</span>
              {project?.name || "Project space"}
            </span>
          </div>

          <div className="topbar-actions">
            {!isAdmin && projects.length > 1 && (
              <select
                className="client-project-switcher"
                aria-label="Choose a project"
                value={project?._id || ""}
                onChange={(event) =>
                  selectClientProject(event.target.value)
                }
              >
                {projects.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}

            <span className="sync-label">
              {isRefreshing
                ? "Syncing…"
                : lastSynced
                ? "Synced " +
                  lastSynced.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Live workspace"}
            </span>

            <button
              className="refresh-button"
              type="button"
              onClick={() => loadProjects(true)}
              disabled={isRefreshing}
            >
              <span
                className={
                  isRefreshing ? "refresh-symbol spinning" : "refresh-symbol"
                }
              >
                ↻
              </span>
              <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
            </button>
          </div>
        </header>

        {dashboardError && (
          <div className="dashboard-alert" role="status">
            <span>
              {project
                ? "Latest refresh failed. Showing the last saved project data."
                : dashboardError}
            </span>
            {!project && (
              <button type="button" onClick={() => loadProjects(false)}>
                Try again
              </button>
            )}
          </div>
        )}

        <div className="dashboard-content">
          {isLoadingProject && !project ? (
            <div className="page-loading">
              <span className="loading-spinner" />
              Loading your workspace…
            </div>
          ) : activePage === "manage" && isAdmin ? (
            <AdminPanel token={token} />
          ) : !project ? (
            <section className="empty-project-card">
              <span className="empty-project-icon">◇</span>
              <span className="eyebrow">WORKSPACE READY</span>
              <h1>Your project will appear here</h1>
              <p>
                Your project manager can add a project to this account. Refresh
                this page after it has been assigned.
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => loadProjects(true)}
              >
                Refresh projects
              </button>
            </section>
          ) : (
            <>
              {activePage === "overview" && (
                <OverviewPage
                  project={project}
                  firstName={firstName}
                  progress={progress}
                  completedCount={completedCount}
                  totalMilestones={totalMilestones}
                  milestoneProgress={milestoneProgress}
                  statusCounts={statusCounts}
                  onOpenPage={changePage}
                />
              )}
              {activePage === "project" && (
                <ProjectPage project={project} progress={progress} />
              )}
              {activePage === "timeline" && (
                <TimelinePage project={project} />
              )}
              {activePage === "files" && (
                <FilesPage
                  project={project}
                  token={token}
                  onProjectUpdated={handleProjectUpdated}
                  allowUpload={!isAdmin}
                />
              )}
              {activePage === "updates" && (
                <UpdatesPage project={project} />
              )}
              {activePage === "messages" && !isAdmin && (
                <MessagesPage
                  project={project}
                  token={token}
                  onProjectUpdated={handleProjectUpdated}
                />
              )}
            </>
          )}

          <footer className="dashboard-footer">
            <span>CLIENTSPACE</span>
            <span>Your project, in focus.</span>
          </footer>
        </div>
      </section>

      {mobileMenuOpen && (
        <button
          className="mobile-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </main>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <section className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </section>
  );
}

function OverviewPage({
  project,
  firstName,
  progress,
  completedCount,
  totalMilestones,
  milestoneProgress,
  statusCounts,
  onOpenPage,
}) {
  const latestUpdate = project.updates?.[0];

  return (
    <>
      <PageHeading
        eyebrow="YOUR PROJECT AT A GLANCE"
        title={"Good to see you, " + firstName + "."}
        description="A clear view of progress, milestones, and the next step."
      />

      <section className="project-banner">
        <div className="project-banner-copy">
          <span className="project-kicker">CURRENT PROJECT</span>
          <h2>{project.name}</h2>
          <p>
            {project.description ||
              "Your project details and progress will appear here."}
          </p>
          <span className="project-status">
            <span className="status-dot" />
            {project.status || "Planning"}
          </span>
        </div>

        <div
          className="progress-ring"
          style={{ "--progress": progress + "%" }}
        >
          <div className="progress-ring-inner">
            <strong>{progress}%</strong>
            <span>complete</span>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="Project summary">
        <SummaryCard
          icon="◈"
          tone="mint"
          label="Project status"
          value={project.status || "Planning"}
          foot="Current stage"
        />
        <SummaryCard
          icon="◷"
          tone="blue"
          label="Milestones"
          value={completedCount + " of " + totalMilestones}
          foot="Completed so far"
        />
        <SummaryCard
          icon="⌁"
          tone="gold"
          label="Target handover"
          value={formatDate(project.deadline)}
          foot="Estimated project date"
        />
      </section>

      <section className="overview-grid">
        <article className="dashboard-card health-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PROJECT HEALTH</span>
              <h2>Milestone progress</h2>
            </div>
            <span className="card-tag">Live data</span>
          </div>

          <div className="chart-layout">
            <div
              className="milestone-ring"
              style={{ "--progress": milestoneProgress + "%" }}
            >
              <div className="milestone-ring-inner">
                <strong>{milestoneProgress}%</strong>
                <span>complete</span>
              </div>
            </div>

            <div className="chart-legend">
              <LegendRow
                tone="done"
                label="Completed"
                value={statusCounts.completed}
              />
              <LegendRow
                tone="active"
                label="In progress"
                value={statusCounts.active}
              />
              <LegendRow
                tone="pending"
                label="Upcoming"
                value={statusCounts.pending}
              />
            </div>
          </div>
        </article>

        <article className="dashboard-card next-step-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">NEXT STEP</span>
              <h2>Keep things moving</h2>
            </div>
            <span className="next-step-icon">↗</span>
          </div>

          <p>
            Review the project timeline or open the latest shared files from
            your workspace.
          </p>

          <div className="quick-links">
            <button type="button" onClick={() => onOpenPage("timeline")}>
              View timeline <span>→</span>
            </button>
            <button type="button" onClick={() => onOpenPage("files")}>
              Open shared files <span>→</span>
            </button>
          </div>
        </article>

        <article className="dashboard-card latest-update-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">LATEST ACTIVITY</span>
              <h2>Recent update</h2>
            </div>
            <button
              className="subtle-link"
              type="button"
              onClick={() => onOpenPage("updates")}
            >
              All updates <span>→</span>
            </button>
          </div>

          {latestUpdate ? (
            <div className="latest-update">
              <span className="update-marker" />
              <div>
                <strong>{latestUpdate.title}</strong>
                <p>
                  {latestUpdate.message || "A project update is available."}
                </p>
                <small>{formatDate(latestUpdate.createdAt)}</small>
              </div>
            </div>
          ) : (
            <p className="empty-state">Project updates will appear here.</p>
          )}
        </article>
      </section>
    </>
  );
}

function SummaryCard({ icon, tone, label, value, foot }) {
  return (
    <article className="summary-card">
      <span className={"summary-icon " + tone}>{icon}</span>
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
      <span className="summary-foot">{foot}</span>
    </article>
  );
}

function LegendRow({ tone, label, value }) {
  return (
    <div className="legend-row">
      <span className={"legend-dot legend-" + tone} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectPage({ project, progress }) {
  return (
    <>
      <PageHeading
        eyebrow="PROJECT DETAILS"
        title={project.name}
        description="Your project scope and current delivery status."
      />

      <section className="project-detail-grid">
        <article className="dashboard-card project-detail-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">OVERVIEW</span>
              <h2>Project brief</h2>
            </div>
            <span className="project-status">
              <span className="status-dot" />
              {project.status || "Planning"}
            </span>
          </div>

          <p className="project-description">
            {project.description || "No project description has been added yet."}
          </p>

          <div className="detail-divider" />

          <div className="detail-facts">
            <div>
              <span>Target handover</span>
              <strong>{formatDate(project.deadline)}</strong>
            </div>
            <div>
              <span>Milestones</span>
              <strong>{project.milestones?.length || 0} stages</strong>
            </div>
            <div>
              <span>Last update</span>
              <strong>{formatDate(project.updates?.[0]?.createdAt)}</strong>
            </div>
          </div>
        </article>

        <article className="dashboard-card project-progress-card">
          <span className="eyebrow">DELIVERY PROGRESS</span>
          <div
            className="progress-ring large-ring"
            style={{ "--progress": progress + "%" }}
          >
            <div className="progress-ring-inner">
              <strong>{progress}%</strong>
              <span>complete</span>
            </div>
          </div>
          <p>
            Progress is updated by your project manager as work moves forward.
          </p>
        </article>
      </section>
    </>
  );
}

function TimelinePage({ project }) {
  const milestones = project.milestones || [];

  return (
    <>
      <PageHeading
        eyebrow="PROJECT PLAN"
        title="Project timeline"
        description="Follow each stage from kickoff through delivery."
      />

      <section className="dashboard-card page-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE ROAD AHEAD</span>
            <h2>Milestones</h2>
          </div>
          <span className="card-tag">{milestones.length} stages</span>
        </div>

        {milestones.length ? (
          <div className="milestone-list">
            {milestones.map((item, index) => (
              <article
                className="milestone-row"
                key={item._id || item.title + index}
              >
                <span
                  className={
                    "milestone-marker " +
                    (item.status || "Pending").toLowerCase().replaceAll(" ", "-")
                  }
                >
                  {item.status === "Completed" ? "✓" : index + 1}
                </span>
                <div className="milestone-details">
                  <strong>{item.title}</strong>
                  <span>{formatDate(item.dueDate)}</span>
                </div>
                <span
                  className={
                    "milestone-status status-" +
                    (item.status || "Pending").toLowerCase().replaceAll(" ", "-")
                  }
                >
                  {item.status || "Pending"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            Milestones will appear here when your project manager adds them.
          </p>
        )}
      </section>
    </>
  );
}

function FilesPage({ project, token, onProjectUpdated, allowUpload }) {
  const files = project.files || [];
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleUpload(event) {
    event.preventDefault();
    const formElement = event.currentTarget;

    if (!selectedFile) {
      setError("Choose a file before uploading.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("The file must be 10 MB or smaller.");
      return;
    }

    setError("");
    setNotice("");
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(
        `${API_BASE}/projects/${project._id}/files`,
        {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          body: formData,
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "The file could not be uploaded.");
      }

      onProjectUpdated(data.project);
      setSelectedFile(null);
      formElement.reset();
      setNotice("File uploaded. Your project team can access it.");
    } catch (uploadError) {
      setError(uploadError.message || "The file could not be uploaded.");
    } finally {
      setIsUploading(false);
    }
  }

  async function downloadUploadedFile(file) {
    setError("");

    try {
      const response = await fetch(API_BASE + file.url, {
        headers: { Authorization: "Bearer " + token },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "The file could not be opened.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (downloadError) {
      setError(downloadError.message || "The file could not be opened.");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="PROJECT DELIVERABLES"
        title="Shared files"
        description="Open files from your project team or upload documents for review."
      />

      <section className="dashboard-card page-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR FILES</span>
            <h2>Project resources</h2>
          </div>
          <span className="card-tag">{files.length} files</span>
        </div>

        {error && (
          <p className="client-action-feedback is-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="client-action-feedback" role="status">
            {notice}
          </p>
        )}

        {files.length ? (
          <div className="file-list">
            {files.map((file, index) => (
              <div
                className="file-row"
                key={file._id || file.name + index}
              >
                <span className="file-icon">▤</span>
                <span className="file-details">
                  <strong>{file.name}</strong>
                  <small>
                    {file.uploadedByRole === "client"
                      ? "Uploaded by you"
                      : "Shared by your project team"}{" "}
                    · {formatDate(file.addedAt)}
                  </small>
                </span>

                {file.storageKey ? (
                  <button
                    className="file-open client-file-button"
                    type="button"
                    onClick={() => downloadUploadedFile(file)}
                  >
                    Download ↗
                  </button>
                ) : (
                  <a
                    className="file-open"
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Shared project files will appear here.</p>
        )}
      </section>

      {allowUpload && (
        <section className="dashboard-card page-card client-upload-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SEND A DELIVERABLE</span>
              <h2>Upload a project file</h2>
            </div>
            <span className="file-icon">↑</span>
          </div>

          <p className="client-action-copy">
            Share a brief, reference, or document with your project team.
            Maximum file size: 10 MB.
          </p>

          <form className="client-upload-form" onSubmit={handleUpload}>
            <label className="client-file-picker">
              <span>
                {selectedFile ? selectedFile.name : "Choose a file"}
              </span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] || null)
                }
              />
            </label>

            <button
              className="admin-button client-action-button"
              type="submit"
              disabled={isUploading}
            >
              {isUploading ? "Uploading…" : "Upload file"}
            </button>
          </form>

          <p className="client-file-note">
            Accepted: PDF, images, documents, spreadsheets, text, and ZIP.
          </p>
        </section>
      )}
    </>
  );
}

function MessagesPage({ project, token, onProjectUpdated }) {
  const [type, setType] = useState("message");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const messages = project.messages || [];

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanMessage = message.trim();

    if (!cleanMessage) {
      setError("Write a message before sending.");
      return;
    }

    setIsSending(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/projects/${project._id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ type, message: cleanMessage }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Your message could not be sent.");
      }

      onProjectUpdated(data.project);
      setMessage("");
      setNotice("Your message was sent to the project team.");
    } catch (sendError) {
      setError(sendError.message || "Your message could not be sent.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="PROJECT COMMUNICATION"
        title="Messages"
        description="Ask a question or send a change request about this project."
      />

      <section className="dashboard-card page-card client-message-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CONTACT YOUR PROJECT TEAM</span>
            <h2>Send a message</h2>
          </div>
          <span className="card-tag">{messages.length} sent</span>
        </div>

        {error && (
          <p className="client-action-feedback is-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="client-action-feedback" role="status">
            {notice}
          </p>
        )}

        <form className="client-message-form" onSubmit={handleSubmit}>
          <label className="client-form-label" htmlFor="client-message-type">
            Message type
          </label>
          <select
            id="client-message-type"
            className="admin-select"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="message">General message</option>
            <option value="change-request">Change request</option>
          </select>

          <label className="client-form-label" htmlFor="client-message-text">
            Your message
          </label>
          <textarea
            id="client-message-text"
            className="admin-textarea client-message-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            placeholder="Describe your question or the change you would like to request…"
            required
          />

          <div className="client-message-submit-row">
            <span>{message.length}/2000</span>
            <button
              className="admin-button client-action-button"
              type="submit"
              disabled={isSending}
            >
              {isSending ? "Sending…" : "Send to project team"}
            </button>
          </div>
        </form>
      </section>

      <section className="dashboard-card page-card client-conversation-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SAVED TO THIS PROJECT</span>
            <h2>Your messages</h2>
          </div>
        </div>

        {messages.length ? (
          <div className="client-message-list">
            {[...messages].reverse().map((item, index) => (
              <article
                className="client-message-item"
                key={item._id || item.createdAt + index}
              >
                <div className="client-message-meta">
                  <strong>{item.senderName || "Client"}</strong>
                  <span>
                    {item.type === "change-request"
                      ? "Change request"
                      : "Message"}
                  </span>
                  <time>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : "Just now"}
                  </time>
                </div>
                <p>{item.message}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            Messages and change requests you send will appear here.
          </p>
        )}
      </section>
    </>
  );
}

function UpdatesPage({ project }) {
  const updates = project.updates || [];

  return (
    <>
      <PageHeading
        eyebrow="PROJECT ACTIVITY"
        title="Project updates"
        description="A record of recent decisions, progress, and delivery notes."
      />

      <section className="dashboard-card page-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ACTIVITY LOG</span>
            <h2>All updates</h2>
          </div>
          <span className="card-tag">{updates.length} updates</span>
        </div>

        {updates.length ? (
          <div className="update-list">
            {updates.map((item, index) => (
              <article
                className="update-row"
                key={item._id || item.title + index}
              >
                <span className="update-marker" />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.message || "Project update"}</p>
                  <small>{formatDate(item.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">Project updates will appear here.</p>
        )}
      </section>
    </>
  );
}

export default App;