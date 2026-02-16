# USMM Developer Guide

USMM (Unified Social Media Manager) is a high-reliability gateway for multi-platform social media interactions. It provides a standardized interface for Facebook, X (Twitter), and Slack, featuring priority-based queueing and persistent storage via Redis.

## 🛠 Features
- **Multi-Platform Support**: Unified API for Facebook, X (Twitter), and Slack.
- **Redis Persistence**: All accounts and tasks are persisted in Redis for reliability.
- **Priority Queueing**: Tasks are processed based on priority levels (Critical, High, Normal).
- **Media Optimization**: Automatic stripping of metadata, high-quality compression, and downscaling for high-res images.
- **Smart Formatting**: Auto-conversion of HTML/Tailwind-like tags to Slack Block Kit.

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

### 4. Database Migration
If you are upgrading from an older version using SQLite:
```bash
pnpm run migrate
```

### 5. Running the Service
```bash
pnpm dev    # Development mode (watch)
pnpm start  # Production mode
```

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
