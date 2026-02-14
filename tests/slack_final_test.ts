import axios from 'axios';

async function sendFinalTest() {
  const webhookUrl = process.env.SLACK_WEBHOOK;
  const endpoint = 'http://localhost:3005/v1/slack/post';

  const caption = '<div class="header">🚨 Critical Incident: API Gateway Latency</div>\n' +
    '<div class="section">\n' +
    '  <b>Summary:</b> Latency in <code>us-east-1</code> exceeded 500ms for 5 consecutive minutes.\n' +
    '</div>\n' +
    '<div class="section">\n' +
    '  <div class="field"><b>Priority:</b><br />🔴 P0 - Immediate</div>\n' +
    '  <div class="field"><b>Assigned To:</b><br /><@U12345678></div>\n' +
    '  <div class="field"><b>Environment:</b><br />Production</div>\n' +
    '  <div class="field"><b>Region:</b><br />us-east-1</div>\n' +
    '</div>\n' +
    '<hr />\n' +
    '<div class="section">\n' +
    '  <b>Current Status Update</b>\n' +
    '  <select placeholder="Update Status">\n' +
    '    <option value="status_investigating">Investigating</option>\n' +
    '    <option value="status_identified">Identified</option>\n' +
    '    <option value="status_resolved">Resolved</option>\n' +
    '  </select>\n' +
    '</div>\n' +
    '<a class="btn-primary" value="ack_incident">Acknowledge</a>\n' +
    '<a href="https://zoom.us" class="btn" value="join_meeting">Join War Room</a>\n' +
    '<a href="https://datadog.com" class="btn" value="view_logs">View Logs</a>\n' +
    '<div class="context">\n' +
    '  <img src="https://api.slack.com" alt="bot icon" />\n' +
    '  Automated alert from <b>DevOps Monitoring</b>. Last check: Feb 14, 17:35 UTC\n' +
    '</div>';

  try {
    console.log('🚀 Sending Final "Critical Incident" USMM post...');
    const response = await axios.post(endpoint, { caption }, {
      headers: {
        'x-platform-id': 'slack-final-test',
        'x-platform-token': webhookUrl
      }
    });
    console.log('✅ Success:', response.data);
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

sendFinalTest();
