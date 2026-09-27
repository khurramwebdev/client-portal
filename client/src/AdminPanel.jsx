import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:5000/api";
const PROJECT_STATUSES = [
  "Planning",
  "In Progress",
  "In Review",
  "Completed",
];

function dateForInput(value) {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function displayDate(value) {
  if (!value) return "Date not set";

  const dateValue = String(value).slice(0, 10);
  const date = new Date(dateValue + "T12:00:00");

  if (Number.isNaN(date.getTime())) return "Date not set";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function displayDateTime(value) {
  if (!value) return "Just now";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Just now"
    : date.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getProjectClientName(project, clients) {
  const linkedClient = project.client || project.clientId;

  if (linkedClient && typeof linkedClient === "object") {
    return linkedClient.name || linkedClient.email || "Client";
  }

  const linkedClientId = linkedClient ? String(linkedClient) : "";
  const matchingClient = clients.find(
    (client) => String(client._id) === linkedClientId
  );

  return matchingClient?.name || project.clientName || "Client";
}

function statusClass(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "completed") return " status-completed";
  if (normalizedStatus === "in progress") return " status-in-progress";

  return "";
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "The request could not be completed.");
  }

  return data;
}

function AdminPanel({ token }) {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [newProject, setNewProject] = useState({
    clientId: "",
    name: "",
    description: "",
  });
  const [newMilestone, setNewMilestone] = useState("");
  const [newFile, setNewFile] = useState({ name: "", url: "" });
  const [newUpdate, setNewUpdate] = useState({ title: "", message: "" });
  const [reply, setReply] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const selectedProject = projects.find((item) => item._id === selectedId);

  const loadWorkspace = useCallback(
    async (showRefreshState = false) => {
      setError("");

      if (showRefreshState) setIsRefreshing(true);

      try {
        const headers = { Authorization: "Bearer " + token };
        const [projectResponse, clientResponse] = await Promise.all([
          fetch(API_BASE + "/projects", { headers }),
          fetch(API_BASE + "/projects/clients", { headers }),
        ]);

        const [projectData, clientData] = await Promise.all([
          readResponse(projectResponse),
          readResponse(clientResponse),
        ]);

        const loadedProjects = projectData.projects || [];
        const loadedClients = clientData.clients || [];

        setProjects(loadedProjects);
        setClients(loadedClients);
        setSelectedId((currentId) =>
          loadedProjects.some((item) => item._id === currentId)
            ? currentId
            : loadedProjects[0]?._id || ""
        );
      } catch (loadError) {
        setError(loadError.message || "Could not load project management.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!selectedProject) {
      setForm(null);
      return;
    }

    setForm({
      name: selectedProject.name || "",
      description: selectedProject.description || "",
      status: selectedProject.status || "Planning",
      progress: selectedProject.progress ?? 0,
      deadline: dateForInput(selectedProject.deadline),
      milestones: selectedProject.milestones || [],
      files: selectedProject.files || [],
      updates: selectedProject.updates || [],
    });
  }, [selectedProject]);

  const filteredProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return projects.filter((project) => {
      const projectStatus = project.status || "Planning";
      const clientName = getProjectClientName(project, clients);

      const matchesSearch =
        !query ||
        [project.name, project.description, clientName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === "All statuses" || projectStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [projects, clients, searchTerm, statusFilter]);

  const activeProjectsCount = projects.filter(
    (project) => project.status === "In Progress"
  ).length;

  const completedProjectsCount = projects.filter(
    (project) => project.status === "Completed"
  ).length;

  function updateForm(field, value) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  async function createProject(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(API_BASE + "/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(newProject),
      });

      const data = await readResponse(response);

      setNewProject({ clientId: "", name: "", description: "" });
      setNotice("Project created successfully.");
      await loadWorkspace();

      if (data.project?._id) setSelectedId(data.project._id);
    } catch (saveError) {
      setError(saveError.message || "Could not create the project.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProject(event) {
    event.preventDefault();

    if (!selectedProject || !form) return;

    setNotice("");
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(
        API_BASE + "/projects/" + selectedProject._id,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            ...form,
            progress: Number(form.progress),
            deadline: form.deadline || null,
          }),
        }
      );

      await readResponse(response);
      setNotice("Project changes saved successfully.");
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError.message || "Could not save project changes.");
    } finally {
      setIsSaving(false);
    }
  }

  function addMilestone() {
    if (!newMilestone.trim() || !form) return;

    updateForm("milestones", [
      ...form.milestones,
      {
        title: newMilestone.trim(),
        status: "Pending",
        dueDate: null,
      },
    ]);

    setNewMilestone("");
  }

  function addFile() {
    if (!newFile.name.trim() || !newFile.url.trim() || !form) return;

    updateForm("files", [
      ...form.files,
      { ...newFile, addedAt: new Date().toISOString() },
    ]);

    setNewFile({ name: "", url: "" });
  }

  function addUpdate() {
    if (!newUpdate.title.trim() || !form) return;

    updateForm("updates", [
      { ...newUpdate, createdAt: new Date().toISOString() },
      ...form.updates,
    ]);

    setNewUpdate({ title: "", message: "" });
  }

  function removeItem(field, index) {
    if (!form) return;

    updateForm(
      field,
      form[field].filter((_, itemIndex) => itemIndex !== index)
    );
  }

  function changeArrayItem(field, index, key, value) {
    if (!form) return;

    const nextItems = [...form[field]];
    nextItems[index] = { ...nextItems[index], [key]: value };
    updateForm(field, nextItems);
  }

  async function sendAdminReply(event) {
    event.preventDefault();

    if (!selectedProject || !reply.trim()) return;

    setNotice("");
    setError("");
    setIsSendingReply(true);

    try {
      const response = await fetch(
        `${API_BASE}/projects/${selectedProject._id}/admin/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ message: reply.trim(), type: "message" }),
        }
      );

      await readResponse(response);
      setReply("");
      setNotice("Reply sent to the client.");
      await loadWorkspace();
    } catch (replyError) {
      setError(replyError.message || "Could not send the reply.");
    } finally {
      setIsSendingReply(false);
    }
  }

  async function sendProjectFile(event) {
    event.preventDefault();

    if (!selectedProject || !uploadFile) {
      setError("Choose a file before uploading.");
      return;
    }

    setNotice("");
    setError("");
    setIsUploading(true);

    const formElement = event.currentTarget;
    const body = new FormData();
    body.append("file", uploadFile);

    try {
      const response = await fetch(
        `${API_BASE}/projects/${selectedProject._id}/admin/files`,
        {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          body,
        }
      );

      await readResponse(response);
      setUploadFile(null);
      formElement.reset();
      setNotice("File shared with the client.");
      await loadWorkspace();
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload the file.");
    } finally {
      setIsUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-loading">
        <span className="loading-spinner" />
        Loading project management…
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <header className="page-heading">
        <div>
          <span className="eyebrow">ADMIN WORKSPACE</span>
          <h1>Manage projects</h1>
          <p>
            Create projects and update the information clients see in their
            workspace.
          </p>
        </div>
        <div className="admin-toolbar">
          <button
            className="admin-button secondary"
            type="button"
            onClick={() => loadWorkspace(true)}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing…" : "Refresh list"}
          </button>
        </div>
      </header>

      {error && (
        <div className="admin-feedback error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="admin-feedback" role="status">
          {notice}
        </div>
      )}

      <div className="summary-grid" aria-label="Project summary">
        <article className="summary-card">
          <span className="summary-icon mint" aria-hidden="true">▤</span>
          <span className="summary-label">Total projects</span>
          <strong>{projects.length}</strong>
          <span className="summary-foot">All client projects</span>
        </article>

        <article className="summary-card">
          <span className="summary-icon blue" aria-hidden="true">◷</span>
          <span className="summary-label">In progress</span>
          <strong>{activeProjectsCount}</strong>
          <span className="summary-foot">Currently active</span>
        </article>

        <article className="summary-card">
          <span className="summary-icon gold" aria-hidden="true">✓</span>
          <span className="summary-label">Completed</span>
          <strong>{completedProjectsCount}</strong>
          <span className="summary-foot">Successfully delivered</span>
        </article>
      </div>

      <section className="admin-section">
        <div>
          <span className="eyebrow">PROJECT DIRECTORY</span>
          <h2>Find a project</h2>
        </div>

        <div className="admin-form-grid">
          <label className="admin-field">
            Search projects
            <input
              className="admin-input"
              type="search"
              placeholder="Search by project or client"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <label className="admin-field">
            Filter by status
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All statuses</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="admin-empty">
          Showing {filteredProjects.length} of {projects.length} projects
        </p>

        {filteredProjects.length ? (
          <div className="admin-list">
            {filteredProjects.map((project) => {
              const projectStatus = project.status || "Planning";
              const clientName = getProjectClientName(project, clients);
              const isSelected = project._id === selectedId;

              return (
                <div className="admin-list-row" key={project._id}>
                  <div className="admin-field">
                    <strong>{project.name || "Untitled project"}</strong>
                    <span className="admin-empty">
                      {clientName} · {Number(project.progress || 0)}% complete
                    </span>
                    <span className="admin-empty">
                      Target: {displayDate(project.deadline)}
                    </span>
                  </div>

                  <span className={"milestone-status" + statusClass(projectStatus)}>
                    {projectStatus}
                  </span>

                  <button
                    className={
                      "admin-button " + (isSelected ? "" : "secondary")
                    }
                    type="button"
                    onClick={() => setSelectedId(project._id)}
                    aria-pressed={isSelected}
                  >
                    {isSelected ? "Selected" : "Edit project"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="admin-empty">
            {projects.length
              ? "No projects match your search and status filter."
              : "No projects have been created yet."}
          </p>
        )}

        {form && selectedProject && (
          <form className="admin-panel" onSubmit={saveProject}>
            <div className="admin-section-divider" />

            <div>
              <span className="eyebrow">PROJECT CONTENT</span>
              <h2>Edit {selectedProject.name}</h2>
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                Project name
                <input
                  className="admin-input"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  required
                />
              </label>

              <label className="admin-field">
                Status
                <select
                  className="admin-select"
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value)}
                >
                  {PROJECT_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label className="admin-field full">
                Description
                <textarea
                  className="admin-textarea"
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                />
              </label>

              <label className="admin-field">
                Progress (%)
                <input
                  className="admin-input"
                  type="number"
                  min="0"
                  max="100"
                  value={form.progress}
                  onChange={(event) =>
                    updateForm("progress", event.target.value)
                  }
                  required
                />
              </label>

              <label className="admin-field">
                Target handover date
                <input
                  className="admin-input"
                  type="date"
                  value={form.deadline}
                  onChange={(event) =>
                    updateForm("deadline", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="admin-section-divider" />

            <div>
              <span className="eyebrow">DELIVERY PLAN</span>
              <h2>Milestones</h2>
            </div>

            <div className="admin-list">
              {form.milestones.map((item, index) => (
                <div
                  className="admin-list-row"
                  key={item._id || item.title + index}
                >
                  <input
                    className="admin-input"
                    aria-label="Milestone title"
                    value={item.title}
                    onChange={(event) =>
                      changeArrayItem(
                        "milestones",
                        index,
                        "title",
                        event.target.value
                      )
                    }
                  />

                  <select
                    className="admin-select"
                    aria-label="Milestone status"
                    value={item.status}
                    onChange={(event) =>
                      changeArrayItem(
                        "milestones",
                        index,
                        "status",
                        event.target.value
                      )
                    }
                  >
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                  </select>

                  <button
                    className="admin-button danger"
                    type="button"
                    onClick={() => removeItem("milestones", index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="admin-inline">
              <input
                className="admin-input"
                placeholder="New milestone name"
                value={newMilestone}
                onChange={(event) => setNewMilestone(event.target.value)}
              />
              <button
                className="admin-button secondary"
                type="button"
                onClick={addMilestone}
              >
                Add milestone
              </button>
            </div>

            <div className="admin-section-divider" />

            <div>
              <span className="eyebrow">DELIVERABLE LINKS</span>
              <h2>Shared file links</h2>
            </div>

            <div className="admin-list">
              {form.files
                .filter((item) => !item.storageKey)
                .map((item, index) => (
                  <div
                    className="admin-file-row"
                    key={item._id || item.name + index}
                  >
                    <input
                      className="admin-input"
                      aria-label="File name"
                      value={item.name}
                      onChange={(event) =>
                        changeArrayItem("files", index, "name", event.target.value)
                      }
                    />

                    <input
                      className="admin-input"
                      aria-label="File URL"
                      value={item.url}
                      onChange={(event) =>
                        changeArrayItem("files", index, "url", event.target.value)
                      }
                    />

                    <button
                      className="admin-button danger"
                      type="button"
                      onClick={() => removeItem("files", index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                File name
                <input
                  className="admin-input"
                  value={newFile.name}
                  onChange={(event) =>
                    setNewFile({ ...newFile, name: event.target.value })
                  }
                />
              </label>

              <label className="admin-field">
                File URL
                <input
                  className="admin-input"
                  type="url"
                  placeholder="https://…"
                  value={newFile.url}
                  onChange={(event) =>
                    setNewFile({ ...newFile, url: event.target.value })
                  }
                />
              </label>

              <div className="admin-field full">
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={addFile}
                >
                  Add file link
                </button>
              </div>
            </div>

            <div className="admin-section-divider" />

            <div>
              <span className="eyebrow">CLIENT ACTIVITY</span>
              <h2>Project updates</h2>
            </div>

            <div className="admin-list">
              {form.updates.map((item, index) => (
                <div
                  className="admin-update-row"
                  key={item._id || item.title + index}
                >
                  <input
                    className="admin-input"
                    aria-label="Update title"
                    value={item.title}
                    onChange={(event) =>
                      changeArrayItem(
                        "updates",
                        index,
                        "title",
                        event.target.value
                      )
                    }
                  />

                  <input
                    className="admin-input"
                    aria-label="Update message"
                    value={item.message}
                    onChange={(event) =>
                      changeArrayItem(
                        "updates",
                        index,
                        "message",
                        event.target.value
                      )
                    }
                  />

                  <button
                    className="admin-button danger"
                    type="button"
                    onClick={() => removeItem("updates", index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                Update title
                <input
                  className="admin-input"
                  value={newUpdate.title}
                  onChange={(event) =>
                    setNewUpdate({ ...newUpdate, title: event.target.value })
                  }
                />
              </label>

              <label className="admin-field full">
                Update details
                <textarea
                  className="admin-textarea"
                  value={newUpdate.message}
                  onChange={(event) =>
                    setNewUpdate({ ...newUpdate, message: event.target.value })
                  }
                />
              </label>

              <div className="admin-field full">
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={addUpdate}
                >
                  Add update
                </button>
              </div>
            </div>

            <div className="admin-section-divider" />

            <button
              className="admin-button save-project-button"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Saving changes…" : "Save project changes"}
            </button>
          </form>
        )}
      </section>

      <section className="admin-section">
        <div>
          <span className="eyebrow">CLIENT COMMUNICATION</span>
          <h2>
            {selectedProject
              ? `Messages and files — ${selectedProject.name}`
              : "Select a project"}
          </h2>
          <p>Review client messages and files, then reply from this workspace.</p>
        </div>

        {!selectedProject ? (
          <p className="admin-empty">
            Select a project above to view its client messages and files.
          </p>
        ) : (
          <>
            <div className="admin-section-divider" />

            <div>
              <span className="eyebrow">CONVERSATION</span>
              <h2>Messages and change requests</h2>
            </div>

            {(selectedProject.messages || []).length ? (
              <div className="admin-list">
                {[...(selectedProject.messages || [])]
                  .reverse()
                  .map((item, index) => (
                    <article
                      className="admin-list-row"
                      key={item._id || item.createdAt + index}
                    >
                      <div className="admin-field">
                        <strong>
                          {item.senderName || "Project participant"} ·{" "}
                          {item.senderRole === "admin" ? "Admin" : "Client"}
                        </strong>
                        <span className="admin-empty">
                          {item.type === "change-request"
                            ? "Change request"
                            : "Message"}{" "}
                          · {displayDateTime(item.createdAt)}
                        </span>
                        <p>{item.message}</p>
                      </div>
                    </article>
                  ))}
              </div>
            ) : (
              <p className="admin-empty">
                No messages have been sent for this project yet.
              </p>
            )}

            <form className="admin-form-grid" onSubmit={sendAdminReply}>
              <label className="admin-field full">
                Reply to client
                <textarea
                  className="admin-textarea"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={2000}
                  placeholder="Write a reply for this client…"
                  required
                />
              </label>

              <div className="admin-field full">
                <button
                  className="admin-button"
                  type="submit"
                  disabled={isSendingReply || !reply.trim()}
                >
                  {isSendingReply ? "Sending…" : "Send reply"}
                </button>
              </div>
            </form>

            <div className="admin-section-divider" />

            <div>
              <span className="eyebrow">PROJECT FILES</span>
              <h2>Files shared with this project</h2>
            </div>

            {(selectedProject.files || []).length ? (
              <div className="admin-list">
                {[...selectedProject.files].reverse().map((item, index) => (
                  <div
                    className="admin-list-row"
                    key={item._id || item.name + index}
                  >
                    <div className="admin-field">
                      <strong>{item.name}</strong>
                      <span className="admin-empty">
                        Sent by {item.uploadedByName || "Project team"} (
                        {item.uploadedByRole || "admin"})
                      </span>
                      <span className="admin-empty">
                        {displayDateTime(item.addedAt)}
                        {item.size ? ` · ${formatFileSize(item.size)}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty">
                No files have been uploaded to this project yet.
              </p>
            )}

            <form className="admin-form-grid" onSubmit={sendProjectFile}>
              <label className="admin-field full">
                Upload a file for the client
                <input
                  className="admin-input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                  onChange={(event) =>
                    setUploadFile(event.target.files?.[0] || null)
                  }
                />
                <span className="admin-empty">
                  Supported files up to 10 MB.
                </span>
              </label>

              <div className="admin-field full">
                <button
                  className="admin-button"
                  type="submit"
                  disabled={isUploading || !uploadFile}
                >
                  {isUploading ? "Uploading…" : "Upload file for client"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      <section className="admin-section">
        <div>
          <span className="eyebrow">NEW WORK</span>
          <h2>Create a client project</h2>
        </div>

        {clients.length ? (
          <form className="admin-form-grid" onSubmit={createProject}>
            <label className="admin-field full">
              Client
              <select
                className="admin-select"
                value={newProject.clientId}
                onChange={(event) =>
                  setNewProject({
                    ...newProject,
                    clientId: event.target.value,
                  })
                }
                required
              >
                <option value="">Choose a client</option>
                {clients.map((client) => (
                  <option key={client._id} value={client._id}>
                    {client.name} — {client.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              Project name
              <input
                className="admin-input"
                value={newProject.name}
                onChange={(event) =>
                  setNewProject({ ...newProject, name: event.target.value })
                }
                required
              />
            </label>

            <label className="admin-field">
              Description
              <input
                className="admin-input"
                value={newProject.description}
                onChange={(event) =>
                  setNewProject({
                    ...newProject,
                    description: event.target.value,
                  })
                }
              />
            </label>

            <div className="admin-field full">
              <button
                className="admin-button"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Creating…" : "Create project"}
              </button>
            </div>
          </form>
        ) : (
          <p className="admin-empty">
            No client accounts are available yet. Create a separate client
            account before assigning a new project.
          </p>
        )}
      </section>
    </div>
  );
}

export default AdminPanel;