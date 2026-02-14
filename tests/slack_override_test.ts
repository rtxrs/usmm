import axios from 'axios';

async function testSlackOverride() {
  const webhookUrl = process.env.SLACK_WEBHOOK;
  const endpoint = 'http://localhost:3005/v1/slack/post';

  const payload = {
    caption: '<div class="header">🎭 Identity Override Test</div>' +
             '<div class="section">This message should appear as <b>Custom Bot</b> with a ghost icon.</div>',
    priority: 5,
    options: {
      dryRun: false,
      slackUsername: 'Custom Bot',
      slackIconUrl: 'https://slack.com/img/icons/app-57.png'
    }
  };

  try {
    console.log('🚀 Sending request with custom identity overrides...');
    const response = await axios.post(endpoint, payload, {
      headers: {
        'x-platform-id': 'slack-override-test',
        'x-platform-token': webhookUrl
      }
    });
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testSlackOverride();
