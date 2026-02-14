import axios from 'axios';

async function testSlackEmoji() {
  const webhookUrl = process.env.SLACK_WEBHOOK;
  const endpoint = 'http://localhost:3005/v1/slack/post';

  const payload = {
    caption: '<div class="header">👻 Emoji Override Test</div>' +
             '<div class="section">This message should have a <b>ghost emoji</b> as the bot icon.</div>',
    priority: 5,
    options: {
      dryRun: false,
      slackUsername: 'SpookyBot',
      slackIconEmoji: ':ghost:'
    }
  };

  try {
    console.log('🚀 Sending request with emoji override...');
    const response = await axios.post(endpoint, payload, {
      headers: {
        'x-platform-id': 'slack-emoji-test',
        'x-platform-token': webhookUrl
      }
    });
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testSlackEmoji();
