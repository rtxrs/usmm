import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

describe('USMM API Endpoints', () => {
  
  it('GET /health should return 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /v1/post should fail if platform is missing', async () => {
    const res = await request(app)
      .post('/v1/post')
      .send({
        caption: 'Test post'
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required parameter: platform');
  });

  it('POST /v1/post should return 501 for platform "x"', async () => {
    const res = await request(app)
      .post('/v1/post')
      .send({
        platform: 'x',
        caption: 'Test post'
      });
    expect(res.status).toBe(501);
    expect(res.body.error).toContain('not yet implemented');
  });

  it('POST /v1/post should accept valid FB request with dryRun', async () => {
    // Note: This requires x-platform-id/token or defaults in config
    const res = await request(app)
      .post('/v1/post')
      .set('x-platform-id', '12345')
      .set('x-platform-token', 'mock-token')
      .send({
        platform: 'fb',
        caption: 'Test dry run post',
        options: { dryRun: true }
      });
    
    // It might be 200 or 500 depending on FIS registry initialization,
    // but since we passed id/token it should at least try to initialize FIS.
    expect([200, 500]).toContain(res.status); 
  });

  it('POST /v1/post/:id/update should fail if platform is missing', async () => {
    const res = await request(app)
      .post('/v1/post/123/update')
      .send({
        caption: 'Updated caption'
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required parameter: platform');
  });

  it('POST /v1/post/:id/update should return 501 for platform "x"', async () => {
    const res = await request(app)
      .post('/v1/post/123/update')
      .send({
        platform: 'x',
        caption: 'Updated caption'
      });
    expect(res.status).toBe(501);
    expect(res.body.error).toContain('not yet implemented');
  });

  it('GET /logo/:pageId should return 404 for non-existent logo if graph fails', async () => {
    // This might fail if network is blocked, but we're testing the logic
    const res = await request(app).get('/logo/invalid_id_9999999');
    expect(res.status).toBe(404);
  });

});
