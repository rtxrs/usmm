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

  it('POST /v1/post should return 401 for platform "x" if credentials missing', async () => {
    const res = await request(app)
      .post('/v1/post')
      .send({
        platform: 'x',
        caption: 'Test post'
      });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Missing Credentials');
  });

  it('POST /v1/post should accept valid X request with dryRun and mock credentials', async () => {
    const mockCreds = JSON.stringify({
      appKey: 'mock', appSecret: 'mock', accessToken: 'mock', accessSecret: 'mock'
    });
    const res = await request(app)
      .post('/v1/post')
      .set('x-platform-id', 'twitter_user_123')
      .set('x-platform-token', Buffer.from(mockCreds).toString('base64'))
      .send({
        platform: 'x',
        caption: 'Test dry run tweet',
        options: { dryRun: true }
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.postId).toContain('DRY_RUN_');
  });

  it('POST /v1/post should accept valid FB request with dryRun', async () => {
    const res = await request(app)
      .post('/v1/post')
      .set('x-platform-id', '12345')
      .set('x-platform-token', 'mock')
      .send({
        platform: 'fb',
        caption: 'Test dry run post',
        options: { dryRun: true }
      });
    
    expect(res.status).toBe(200); 
    expect(res.body.success).toBe(true);
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

  it('POST /v1/post/:id/update should return 401 for platform "x" if credentials missing', async () => {
    const res = await request(app)
      .post('/v1/post/123/update')
      .send({
        platform: 'x',
        caption: 'Updated caption'
      });
    expect(res.status).toBe(401);
  });

  it('GET /logo/:platform/:id should return 404 for non-existent logo if graph fails', async () => {
    const res = await request(app).get('/logo/fb/invalid_id_9999999');
        expect(res.status).toBe(404);
      });
    
      describe('Specialized Platform Routes', () => {
        
        it('POST /v1/fb/post should work for dryRun without "platform" in body', async () => {
          const res = await request(app)
            .post('/v1/fb/post')
            .set('x-platform-id', '12345')
            .set('x-platform-token', 'mock')
            .send({
              caption: 'Specialized FB test',
              options: { dryRun: true }
            });
          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);
        });
    
        it('POST /v1/x/post should work for dryRun without "platform" in body', async () => {
          const mockCreds = JSON.stringify({
            appKey: 'mock', appSecret: 'mock', accessToken: 'mock', accessSecret: 'mock'
          });
          const res = await request(app)
            .post('/v1/x/post')
            .set('x-platform-id', 'twitter_user')
            .set('x-platform-token', Buffer.from(mockCreds).toString('base64'))
            .send({
              caption: 'Specialized X test',
              options: { dryRun: true }
            });
          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);
        });
    
        it('POST /v1/slack/post should work for dryRun without "platform" in body', async () => {
          const res = await request(app)
            .post('/v1/slack/post')
            .set('x-platform-id', 'slack-channel')
            .set('x-platform-token', 'https://hooks.slack.com/services/MOCK/TOKEN')
            .send({
              caption: 'Specialized Slack test',
              options: { dryRun: true }
            });
          expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
              });
          
              it('POST /v1/slack/post should work WITHOUT x-platform-id header (auto-id)', async () => {
                const res = await request(app)
                  .post('/v1/slack/post')
                  .set('x-platform-token', 'https://hooks.slack.com/services/MOCK/AUTO/ID')
                  .send({
                    caption: 'Auto-ID Slack test',
                    options: { dryRun: true }
                  });
                      expect(res.status).toBe(200);
                      expect(res.body.success).toBe(true);
                    });
                
                    it('POST /v1/x/post should work WITHOUT x-platform-id header (auto-id)', async () => {
                      const mockCreds = JSON.stringify({
                        appKey: 'mock', appSecret: 'mock', accessToken: 'mock', accessSecret: 'mock'
                      });
                      const res = await request(app)
                        .post('/v1/x/post')
                        .set('x-platform-token', Buffer.from(mockCreds).toString('base64'))
                        .send({
                          caption: 'Auto-ID X test',
                          options: { dryRun: true }
                        });
                            expect(res.status).toBe(200);
                            expect(res.body.success).toBe(true);
                          });
                      
                          it('POST /v1/fb/post should work WITHOUT x-platform-id header (auto-id)', async () => {
                            const res = await request(app)
                              .post('/v1/fb/post')
                              .set('x-platform-token', 'mock')
                              .send({
                                caption: 'Auto-ID FB test',
                                options: { dryRun: true }
                              });
                            expect(res.status).toBe(200);
                            expect(res.body.success).toBe(true);
                          });
                      
                          it('POST /v1/fb/post/:id/update should work for dryRun', async () => {
                      
                          const res = await request(app)
            .post('/v1/fb/post/123/update')
            .set('x-platform-id', '12345')
            .set('x-platform-token', 'mock')
            .send({
              caption: 'Updated FB caption',
              dryRun: true
            });
          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);
        });
    
      });
    
    });
    