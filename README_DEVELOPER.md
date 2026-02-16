# USMM Developer Guide

USMM (Unified Social Media Manager) is a high-reliability gateway for multi-platform social media interactions. It provides a standardized interface for Facebook, X (Twitter), and Slack, featuring priority-based queueing and persistent storage via Redis.

## 🛠 Features
- **Multi-Platform Support**: Unified API for Facebook, X (Twitter), and Slack.
- **Redis Persistence & Recovery**: All accounts and tasks are persisted in Redis. A built-in recovery system reloads pending tasks on server startup.
- **Priority Queueing**: Tasks are processed based on priority levels (Critical, High, Normal).
- **Media Optimization & Parity**: 
    - Automatic stripping of metadata and high-quality compression.
    - Auto-downscaling to 2048px for images.
    - **Chunked Video Uploads**: Implements 4MB segmented uploads for Facebook (Start/Append/Finish phases) and native chunked support for X to handle large assets reliably.
- **Slack Smart Formatting**: 
    - Auto-conversion of HTML/Tailwind-like tags to Slack Block Kit.
    - **Overflow Protection**: Headers > 3000 chars are automatically split into sections. Confirmation text > 300 chars is moved to an auxiliary context block to prevent API rejection while preserving context.

## 🚀 Setup & Installation

### 1. Prerequisites
- Node.js (v18+)
- Redis Server (local or cloud)

### 2. Installation
```bash
pnpm install
```

### 3. Environment Configuration
Create a `.env` or `.env.local` file with the following:
```env
PORT=3005
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_URL=redis://... (optional)

# Optional default credentials
FB_PAGE_ID=
FB_PAGE_ACCESS_TOKEN=
```

### 4. Running the Service

#### Development
```bash
pnpm dev    # Development mode with watch (tsx)
```

#### Production (Self-Hosted)
For production environments, ensure Redis is running and use the following:
```bash
pnpm start  # Standard production start (tsx)
```

If using **PM2** on your production server:
```bash
pm2 start ecosystem.config.cjs
```
*(Note: PM2 is not required for local development and has been removed from local devDependencies.)*


## 📊 Priority Levels
- `CRITICAL (10)`: Immediate priority for urgent announcements.
- `HIGH (5)`: Elevated priority for important updates.
- `NORMAL (0)`: Standard priority for routine content.

## 🏗 Architecture
- `src/core/Database.ts`: Redis client and data persistence logic.
- `src/core/QueueManager.ts`: Priority-based task execution.
- `src/core/SocialMediaRegistry.ts`: Multi-tenant instance management.
- `src/api/controller.ts`: API endpoint logic and media processing.
- `src/validation/schemas.ts`: Zod schemas for request validation.

## 🧪 Testing
```bash
pnpm test                          # Run all unit tests
pnpm vitest run tests/load.test.ts # Run load simulation
```
