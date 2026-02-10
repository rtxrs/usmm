# USSM Expansion Plan: X (Twitter) Integration

## 1. Overview
The goal is to evolve the service from a Facebook-only gateway (UFBM) to a multi-platform Unified Social Media Manager (USSM). The first additional platform will be X (Twitter).

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
*   **New:** `USSMRegistry` maps `Platform:ID -> Service Instance`
    *   Example Key: `fb:123456789` or `x:987654321`

### 2.3 Twitter Client (`src/core/TwitterClient.ts`)
*   **API Version:** X API v2.
*   **Auth:** OAuth 1.0a (User Context) is required for posting media and tweets on behalf of a user. The `x-platform-token` header may need to carry a JSON string containing `{ appKey, appSecret, accessToken, accessSecret }` or we establish a standard format.
*   **Media Upload:** Requires the chunked upload v1.1 endpoint (init, append, finalize).

## 3. Rate Limiting Strategy
*   **Facebook:** ~10 posts/min (custom safe limit).
*   **X (Free/Basic):** Strictly limited (e.g., 50 posts/24h for Free, 100/24h for Basic).
*   **Action:** `QueueManager` must support distinct rate limit strategies per platform instance.

## 4. Input Standardization
The `PostRequestSchema` has been updated to accept `platform: 'fb' | 'x'`.
*   **Facebook:** `caption` -> Message, `media` -> Photos/Videos.
*   **X:** `caption` -> Tweet Text (max 280 chars), `media` -> Max 4 photos or 1 video.

## 5. Next Steps
1.  Refactor `FIS` class to `SocialMediaService`.
2.  Implement `TwitterClient`.
3.  Update `controller.ts` to instantiate the correct client based on the `platform` param.
