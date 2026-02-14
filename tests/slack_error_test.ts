import axios from 'axios';

async function testSlackError() {
  const webhookUrl = process.env.SLACK_WEBHOOK;
  const endpoint = 'http://localhost:3005/v1/slack/post';

  const payload = {
    caption: '', // Empty caption should result in Slack error if handled as such
    priority: 5,
    options: {
      dryRun: false
    }
  };

  try {
    console.log('🚀 Sending request to trigger Slack error...');
    const response = await axios.post(endpoint, payload, {
      headers: {
        'x-platform-id': 'slack-error-test',
        'x-platform-token': webhookUrl
      }
    });
    console.log('✅ Success:', response.data);
  } catch (error: any) {
    console.log('❌ Captured Error Response:');
    console.log(JSON.stringify(error.response?.data, null, 2));
  }
}

testSlackError();
