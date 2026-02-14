import axios from 'axios';

async function testSlack() {
  const webhookUrl = process.env.SLACK_WEBHOOK;
  const endpoint = 'http://localhost:3005/v1/post';

  const caption = ':spider: USMM Slack Integration Test\n' +
    '<div class="section">The <b>Tailwind-style</b> formatter is now active! This message was sent via USMM proxy.</div>\n' +
    '<div class="context">Environment: development | Status: <i>Operational</i></div>\n' +
    '<a href="https://github.com/google/gemini-cli" class="btn-primary">View Gemini CLI</a>\n' +
    '<a href="https://hooks.slack.com" class="btn-danger">Critical Action</a>';

  const payload = {
    platform: 'slack',
    caption: caption,
    priority: 10,
    options: {
      dryRun: false
    }
  };

  try {
    console.log('🚀 Sending test post to local USMM server...');
    const response = await axios.post(endpoint, payload, {
      headers: {
        'x-platform-id': 'slack-test-channel',
        'x-platform-token': webhookUrl
      }
    });
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testSlack();
