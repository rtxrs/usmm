# USMM Expansion Plan: X (Twitter) Integration

## 1. Overview
The goal is to evolve the service from a Facebook-only gateway (UFBM) to a multi-platform Unified Social Media Manager (USMM). The first additional platform will be X (Twitter).

## 2. Architecture Updates

### 2.1 Interface Standardization
Create a `SocialMediaClient` interface to enforce consistency:
```typescript
interface SocialMediaClient {
  post(content: PostContent): Promise<PostResponse>;
  uploadMedia(media: MediaAsset): Promise<string>; // Returns Media ID
  deletePost(id: string): Promise<boolean>;
}
```

### 2.2 Registry Evolution
*   **Current:** `FISRegistry` maps `PageID -> FIS Instance`
*   **New:** `USMMRegistry` maps `Platform:ID -> Service Instance`
    *   Example Key: `fb:123456789` or `x:987654321`

### 2.3 Twitter Client (`src/core/TwitterClient.ts`)
*   **API Version:** X API v2.
*   **Auth Strategy (Adaptive Token):** 
    *   The `x-platform-token` header will be parsed.
    *   If it starts with `{`, it is treated as a JSON object containing OAuth 1.0a keys:
        ```typescript
        interface TwitterCredentials {
          apiKey: string;
          apiSecret: string;
          accessToken: string;
          accessSecret: string;
        }
        ```
    *   The `TwitterClient` constructor will validate these fields.
*   **Media Upload:** Requires the chunked upload v1.1 endpoint (init, append, finalize).

## 3. Rate Limiting Strategy
*   **Facebook:** ~10 posts/min (custom safe limit).
*   **X (Free/Basic):** Strictly limited (e.g., 50 posts/24h for Free, 100/24h for Basic).
*   **Action:** `QueueManager` must support distinct rate limit strategies per platform instance.

## 4. Input Standardization
The `PostRequestSchema` has been updated to accept `platform: 'fb' | 'x'`.
*   **Facebook:** `caption` -> Message, `media` -> Photos/Videos.
*   **X:** `caption` -> Tweet Text (max 280 chars), `media` -> Max 4 photos or 1 video.

## 5. Roadmap

### Core Infrastructure
- [x] Refactor `FIS` class to `SocialMediaService`
- [x] Implement `USMMRegistry` for multi-platform instance management
- [x] Implement `TwitterClient` with OAuth 1.0a support
- [x] Update `SocialMediaController` for platform-based routing
- [x] Fix multipart/form-data merging for media metadata and alt-text

### Platform Enhancements
- [ ] Add support for X (Twitter) multi-image uploads (up to 4)
- [ ] Implement Twitter-specific character limit validation (280 chars)
- [ ] Add support for Instagram via Facebook Graph API
- [ ] Implement LinkedIn integration

### Reliability & UX
- [x] Implement persistent queue storage (Redis)
- [ ] Add a dashboard tab for managing platform credentials
- [ ] Support scheduled posts with a calendar view
- [ ] Add more robust error recovery for partial batch failures
