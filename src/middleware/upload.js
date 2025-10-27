// src/middleware/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";

/* =========
   FOLDERS
   ========= */
const bannersDir  = path.join(process.cwd(), "src", "public", "uploads", "banners");
const brandingDir = path.join(process.cwd(), "src", "public", "uploads", "branding");

// Ensure folders exist
fs.mkdirSync(bannersDir,  { recursive: true });
fs.mkdirSync(brandingDir, { recursive: true });

/* ==========================
   SHARED STORAGE FACTORY
   ========================== */
const makeDiskStorage = (destDir) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destDir),
    filename: (_req, file, cb) => {
      const ext  = path.extname(file.originalname);
      const base = path
        .basename(file.originalname, ext)
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, ""); // keep filenames clean
      cb(null, `${base}-${Date.now()}${ext}`);
    },
  });

/* ==========================
   EXISTING: Banner uploader
   (unchanged usage)
   ========================== */
export const bannerUpload = multer({
  storage: makeDiskStorage(bannersDir),
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(png|jpeg|jpg|webp|gif)/i.test(file.mimetype);
    cb(ok ? null : new Error("Invalid image type"), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* ==========================
   NEW: Logo uploader
   (for admin settings)
   ========================== */
export const logoUpload = multer({
  storage: makeDiskStorage(brandingDir),
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(png|jpeg|jpg|webp)/i.test(file.mimetype);
    cb(ok ? null : new Error("Invalid image type"), ok);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});
