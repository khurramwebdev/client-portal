import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Planning", "In Progress", "In Review", "Completed"],
      default: "Planning",
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    deadline: {
      type: Date,
      default: null,
    },
    milestones: [
      {
        title: { type: String, required: true },
        status: {
          type: String,
          enum: ["Pending", "In Progress", "Completed"],
          default: "Pending",
        },
        dueDate: { type: Date, default: null },
      },
    ],
    files: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        storageKey: { type: String, default: null },
        mimeType: { type: String, default: "application/octet-stream" },
        size: { type: Number, default: 0 },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        uploadedByName: { type: String, default: "" },
        uploadedByRole: {
          type: String,
          enum: ["client", "admin"],
          default: "admin",
        },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    updates: [
      {
        title: { type: String, required: true },
        message: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    messages: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        senderName: { type: String, required: true, trim: true },
        senderRole: {
          type: String,
          enum: ["client", "admin"],
          required: true,
        },
        type: {
          type: String,
          enum: ["message", "change-request"],
          default: "message",
        },
        message: {
          type: String,
          required: true,
          trim: true,
          maxlength: 2000,
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);

export default Project;