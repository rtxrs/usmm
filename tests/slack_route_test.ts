import axios from 'axios';

async function testNewSlackRoute() {
  const webhookUrl = process.env.SLACK_WEBHOOK;
  const endpoint = 'http://localhost:3005/v1/slack/post'; // Using the NEW specific route

  const payload = {
    // Note: 'platform' is NOT required in the body for specific routes anymore!
    caption: '<div class="header">💎 Specialized Route Test</div>' +
             '<div class="section">This was sent via <code>/v1/slack/post</code>.</div>',
    priority: 5,
    options: {
      dryRun: false
    }
  };

  try {
    console.log('🚀 Sending request to specialized /v1/slack/post...');
    const response = await axios.post(endpoint, payload, {
      headers: {
        'x-platform-id': 'slack-route-test',
        'x-platform-token': webhookUrl
      }
    });
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testNewSlackRoute();
