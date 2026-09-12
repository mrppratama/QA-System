import multer from 'multer';
import path from 'path';

const storage = multer.memoryStorage();

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  
  const allowedExts = ['.xlsx'];
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ];

  if (allowedExts.includes(ext) && (allowedMimes.includes(mime) || mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('octet'))) {
    cb(null, true);
  } else {
    cb(new Error('Only .xlsx files are allowed'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});
