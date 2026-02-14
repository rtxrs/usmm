import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { SocialMediaController } from './api/controller.js';
import { logger } from './utils/logger.js';
import { StreamManager } from './core/StreamManager.js';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB overall limit (enforced more strictly in controller)
  }
});

const LOGO_CACHE_DIR = path.join(process.cwd(), 'public', 'cache', 'logos');
if (!fs.existsSync(LOGO_CACHE_DIR)) {
  fs.mkdirSync(LOGO_CACHE_DIR, { recursive: true });
}

StreamManager.init(io);

// Global Error Handlers to prevent EPIPE/Broken Pipe crashes
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  if ((err as any).code === 'EPIPE') {
    logger.warn('EPIPE (Broken Pipe) detected. Ignoring to keep server alive.');
    return;
  }
  // For other errors, we might want to exit gracefully depending on severity
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason });
});

// Security: Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, 
  standardHeaders: true, 
  legacyHeaders: false,
  // Smart Key: Limit by IP AND Platform ID to prevent distributed Page spam
  keyGenerator: (req) => {
    const platformId = req.headers['x-platform-id'] || req.headers['x-fb-page-id'] || 'anonymous';
    return `${req.ip}_${platformId}`;
  },
  validate: { default: false }, // Resolve validation errors
  message: { success: false, error: 'Too many requests for this platform/IP, please try again later.' },
  skip: (req) => {
    const isDryRun = req.body?.options?.dryRun === true || req.body?.options?.dryRun === 'true' || req.body?.dryRun === true || req.body?.dryRun === 'true';
    return isDryRun;
  }
});

const dryRunLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, 
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `dryrun_${req.ip}`,
  validate: { default: false },
  message: { success: false, error: 'Dry run quota exceeded, please wait a minute.' },
  skip: (req) => {
    const isDryRun = req.body?.options?.dryRun === true || req.body?.options?.dryRun === 'true' || req.body?.dryRun === true || req.body?.dryRun === 'true';
    return !isDryRun;
  }
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for simple demo to allow inline scripts/styles if needed
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/logo/:platform/:id', async (req, res) => {
  const { platform, id } = req.params;
  const fileName = `${platform}_${id}.jpg`;
  const filePath = path.join(LOGO_CACHE_DIR, fileName);

  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  // Fallback for FB if not yet cached by Service
  if (platform === 'fb') {
    try {
      const response = await axios.get(`https://graph.facebook.com/${id}/picture?type=large`, {
        responseType: 'arraybuffer'
      });
      fs.writeFileSync(filePath, response.data);
      res.set('Content-Type', 'image/jpeg');
      return res.send(response.data);
    } catch (e) {}
  }

  if (platform === 'slack') {
    try {
      const response = await axios.get('https://cdn.brandfetch.io/slack.com/w/400/h/400', {
        responseType: 'arraybuffer'
      });
      fs.writeFileSync(filePath, response.data);
      res.set('Content-Type', 'image/png');
      return res.send(response.data);
    } catch (e) {}
  }

  res.status(404).send('Logo not found');
});

// Apply Rate Limiter to API routes
app.use('/v1', apiLimiter);
app.use('/v1', dryRunLimiter);

app.post('/v1/post', upload.array('media'), SocialMediaController.createPost);
app.post('/v1/post/:id/update', SocialMediaController.updatePost);

// Platform-Specific Routes
app.post('/v1/fb/post', upload.array('media'), SocialMediaController.createFacebookPost);
app.post('/v1/fb/post/:id/update', SocialMediaController.updateFacebookPost);

app.post('/v1/x/post', upload.array('media'), SocialMediaController.createTwitterPost);
app.post('/v1/x/post/:id/update', SocialMediaController.updateTwitterPost);

app.post('/v1/slack/post', upload.array('media'), SocialMediaController.createSlackPost);
app.post('/v1/slack/post/:id/update', SocialMediaController.updateSlackPost);

app.get('/v1/stats', SocialMediaController.getStats);

// Error Handler for Multer
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size is 100MB.' });
    }
  }
  next(err);
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(config.PORT, () => {
    logger.info(`🚀 USMM Server running on port ${config.PORT}`, {
      pageId: config.FB_PAGE_ID,
      concurrency: config.CONCURRENCY,
      nodeEnv: process.env.NODE_ENV
    });
  });
}

export { app, httpServer };
