import axios from 'axios';

async function sendDashboardTest() {
  const webhookUrl = process.env.SLACK_WEBHOOK;
  const endpoint = 'http://localhost:3005/v1/slack/post';

  const caption = '<div class="header">🚀 Global Deployment Dashboard: v2.4.1</div>\n' +
    '<ul>\n' +
    '  <li><b>Current Pipeline Status</b></li>\n' +
    '  <li>Build Stage: ✅ Success</li>\n' +
    '  <li>Testing: ⚠️ 2 Non-critical failures</li>\n' +
    '</ul>\n' +
    '<hr />\n' +
    '<div class="section">\n' +
    '  <div class="field"><b>Region:</b><br /><code>us-east-1</code></div>\n' +
    '  <div class="field"><b>Instance Count:</b><br /><code>480/500</code></div>\n' +
    '  <div class="field"><b>Error Rate:</b><br /><code>0.02%</code></div>\n' +
    '  <div class="field"><b>Latency:</b><br /><code>42ms</code></div>\n' +
    '  <select multiple placeholder="Select Nodes to Patch">\n' +
    '    <option value="a">Node-A</option>\n' +
    '    <option value="b">Node-B</option>\n' +
    '  </select>\n' +
    '</div>\n' +
    '<a class="btn-danger" value="rb_241">Rollback</a>\n' +
    '<input type="date" value="2024-05-21" placeholder="Schedule Sync" />\n' +
    '<input type="time" value="12:00" placeholder="Select Time" />\n' +
    '<select class="overflow">\n' +
    '  <option value="restart">Restart Servers</option>\n' +
    '  <option value="flush">Flush Cache</option>\n' +
    '</select>\n' +
    '<div class="context">\n' +
    '  📊 <b>System Load:</b> [■■■■■■□□□□] 62% | <b>Thread ID:</b> <code>8823-X</code>\n' +
    '</div>';

  try {
    console.log('🚀 Sending Enterprise "Global Dashboard" USMM post...');
    const response = await axios.post(endpoint, { caption }, {
      headers: {
        'x-platform-id': 'slack-dashboard-test',
        'x-platform-token': webhookUrl
      }
    });
    console.log('✅ Success:', response.data);
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

sendDashboardTest();
