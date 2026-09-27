import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Project from "../models/Project.js";
import User from "../models/User.js";

const router = express.Router();
const routeDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.join(routeDirectory, "../uploads");

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedExtensions = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".zip",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return callback(
        new Error(
          "Choose a PDF, image, document, spreadsheet, text, or ZIP file."
        )
      );
    }

    return callback(null, true);
  },
});

function handleSingleUpload(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();

    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

    return res.status(status).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "The file must be 10 MB or smaller."
          : error.message || "The file could not be uploaded.",
    });
  });
}

function requireLogin(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Please sign in to continue.",
    });
  }

  try {
    req.user = jwt.verify(
      authorization.split(" ")[1],
      process.env.JWT_SECRET
    );

    return next();
  } catch {
    return res.status(401).json({
      message: "Your session is invalid. Please sign in again.",
    });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Administrator access is required.",
    });
  }

  return next();
}

function requireClient(req, res, next) {
  if (req.user.role !== "client") {
    return res.status(403).json({
      message: "Client account access is required.",
    });
  }

  return next();
}

async function findVisibleProject(projectId, user) {
  if (!mongoose.isValidObjectId(projectId)) return null;

  const filter = { _id: projectId };

  if (user.role !== "admin") {
    filter.client = user.userId;
  }

  return Project.findOne(filter);
}

async function saveProjectMessage(req, res, senderRole) {
  try {
    const messageText = String(req.body.message || "").trim();
    const type =
      req.body.type === "change-request" ? "change-request" : "message";

    if (!messageText) {
      return res.status(400).json({
        message: "Write a message before sending.",
      });
    }

    if (messageText.length > 2000) {
      return res.status(400).json({
        message: "Messages must be 2,000 characters or fewer.",
      });
    }

    const project = await findVisibleProject(
      req.params.projectId,
      req.user
    );

    if (!project) {
      return res.status(404).json({
        message: "Project was not found.",
      });
    }

    const sender = await User.findById(req.user.userId)
      .select("name")
      .lean();

    if (!sender) {
      return res.status(401).json({
        message: "Your account could not be found.",
      });
    }

    project.messages.push({
      sender: sender._id,
      senderName: sender.name,
      senderRole,
      type,
      message: messageText,
      createdAt: new Date(),
    });

    await project.save();
    await project.populate("client", "name email");

    return res.status(201).json({
      message: "Message sent successfully.",
      project,
    });
  } catch (error) {
    console.error("Save project message error:", error.message);

    return res.status(500).json({
      message: "Could not send the message.",
    });
  }
}

async function saveUploadedFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Choose a file to upload.",
      });
    }

    const project = await findVisibleProject(
      req.params.projectId,
      req.user
    );

    if (!project) {
      await fs.promises.unlink(req.file.path).catch(() => {});

      return res.status(404).json({
        message: "Project was not found.",
      });
    }

    const sender = await User.findById(req.user.userId)
      .select("name")
      .lean();

    const fileId = new mongoose.Types.ObjectId();
    const displayName =
      path
        .basename(req.file.originalname)
        .replace(/[\\/:*?"<>|]/g, "_")
        .slice(0, 120) || "Project file";

    project.files.push({
      _id: fileId,
      name: displayName,
      url: `/projects/${project._id}/files/${fileId}/download`,
      storageKey: path.basename(req.file.filename),
      mimeType: req.file.mimetype || "application/octet-stream",
      size: req.file.size,
      uploadedBy: req.user.userId,
      uploadedByName: sender?.name || "Project team",
      uploadedByRole: req.user.role,
      addedAt: new Date(),
    });

    await project.save();
    await project.populate("client", "name email");

    return res.status(201).json({
      message: "File uploaded successfully.",
      project,
    });
  } catch (error) {
    if (req.file?.path) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }

    console.error("Project file upload error:", error.message);

    return res.status(500).json({
      message: "Could not save the uploaded file.",
    });
  }
}

router.get("/clients", requireLogin, requireAdmin, async (_req, res) => {
  try {
    const clients = await User.find({ role: "client" })
      .select("_id name email")
      .sort({ name: 1 })
      .lean();

    return res.json({ clients });
  } catch (error) {
    console.error("Load clients error:", error.message);

    return res.status(500).json({
      message: "Could not load client accounts.",
    });
  }
});

router.get("/", requireLogin, async (req, res) => {
  try {
    const filter =
      req.user.role === "admin" ? {} : { client: req.user.userId };

    let projects = await Project.find(filter)
      .populate("client", "name email")
      .sort({ updatedAt: -1 })
      .lean();

    if (req.user.role !== "admin" && projects.length === 0) {
      const now = Date.now();

      const project = await Project.create({
        client: req.user.userId,
        name: "Client Portal Website — Demo",
        description:
          "A sample project workspace showing progress, milestones, files, and updates.",
        status: "In Progress",
        progress: 45,
        deadline: new Date(now + 21 * 24 * 60 * 60 * 1000),
        milestones: [
          {
            title: "Project kickoff",
            status: "Completed",
            dueDate: new Date(now - 14 * 24 * 60 * 60 * 1000),
          },
          {
            title: "Interface design",
            status: "Completed",
            dueDate: new Date(now - 7 * 24 * 60 * 60 * 1000),
          },
          {
            title: "Website development",
            status: "In Progress",
            dueDate: new Date(now + 7 * 24 * 60 * 60 * 1000),
          },
          {
            title: "Testing and handover",
            status: "Pending",
            dueDate: new Date(now + 21 * 24 * 60 * 60 * 1000),
          },
        ],
        updates: [
          {
            title: "Your project space is ready",
            message:
              "This demo project shows how progress and milestones appear in your portal.",
          },
        ],
      });

      projects = [await Project.findById(project._id)
        .populate("client", "name email")
        .lean()];
    }

    return res.json({ projects });
  } catch (error) {
    console.error("Load projects error:", error.message);

    return res.status(500).json({
      message: "Could not load projects.",
    });
  }
});

router.post("/", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { clientId, name, description, status, progress, deadline } =
      req.body;

    if (!clientId || !name?.trim()) {
      return res.status(400).json({
        message: "A client and project name are required.",
      });
    }

    const client = await User.findOne({
      _id: clientId,
      role: "client",
    });

    if (!client) {
      return res.status(404).json({
        message: "Client account was not found.",
      });
    }

    const project = await Project.create({
      client: clientId,
      name: name.trim(),
      description: description || "",
      status,
      progress,
      deadline: deadline || null,
    });

    await project.populate("client", "name email");

    return res.status(201).json({
      message: "Project created successfully.",
      project,
    });
  } catch (error) {
    console.error("Create project error:", error.message);

    return res.status(500).json({
      message: "Could not create the project.",
    });
  }
});

router.put("/:projectId", requireLogin, requireAdmin, async (req, res) => {
  try {
    const allowedFields = [
      "name",
      "description",
      "status",
      "progress",
      "deadline",
      "milestones",
      "files",
      "updates",
    ];

    const changes = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        changes[field] = req.body[field];
      }
    }

    const project = await Project.findByIdAndUpdate(
      req.params.projectId,
      changes,
      {
        new: true,
        runValidators: true,
      }
    ).populate("client", "name email");

    if (!project) {
      return res.status(404).json({
        message: "Project was not found.",
      });
    }

    return res.json({
      message: "Project updated successfully.",
      project,
    });
  } catch (error) {
    console.error("Update project error:", error.message);

    return res.status(500).json({
      message: "Could not update the project.",
    });
  }
});

router.post(
  "/:projectId/messages",
  requireLogin,
  requireClient,
  (req, res) => saveProjectMessage(req, res, "client")
);

router.post(
  "/:projectId/admin/messages",
  requireLogin,
  requireAdmin,
  (req, res) => saveProjectMessage(req, res, "admin")
);

router.post(
  "/:projectId/files",
  requireLogin,
  requireClient,
  handleSingleUpload,
  saveUploadedFile
);

router.post(
  "/:projectId/admin/files",
  requireLogin,
  requireAdmin,
  handleSingleUpload,
  saveUploadedFile
);

router.get(
  "/:projectId/files/:fileId/download",
  requireLogin,
  async (req, res) => {
    try {
      const project = await findVisibleProject(
        req.params.projectId,
        req.user
      );

      if (!project) {
        return res.status(404).json({
          message: "Project was not found.",
        });
      }

      const file = project.files.id(req.params.fileId);

      if (!file?.storageKey) {
        return res.status(404).json({
          message: "Uploaded file was not found.",
        });
      }

      const safeStorageKey = path.basename(file.storageKey);
      const filePath = path.join(uploadDirectory, safeStorageKey);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          message: "The file is no longer available.",
        });
      }

      return res.download(filePath, file.name, (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({
            message: "Could not open the uploaded file.",
          });
        }
      });
    } catch (error) {
      console.error("Download project file error:", error.message);

      return res.status(500).json({
        message: "Could not open the uploaded file.",
      });
    }
  }
);

export default router;