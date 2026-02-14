import { SlackFormatter } from '../src/utils/SlackFormatter.js';

const masterInput = '<div class="header">🛠️ System Master Controller v4.0</div>\n' +
'<div class="section">\n' +
'  <b>Status:</b> Operational<br />\n' +
'  <b>Uptime:</b> 99.9% <br />\n' +
'  This is a <i>Section Block</i> with markdown and an accessory image.\n' +
'  <img src="https://api.slack.com" alt="status_icon" />\n' +
'</div>\n' +
'<hr />\n' +
'<div class="section">\n' +
'  <div class="field"><b>Region:</b><br /><code>AWS-USE-1</code></div>\n' +
'  <div class="field"><b>Cluster:</b><br /><code>K8S-Production</code></div>\n' +
'  <div class="field"><b>CPU Load:</b><br /><code>████░░░░░░ 42%</code></div>\n' +
'  <div class="field"><b>Latency:</b><br /><code>24ms</code></div>\n' +
'</div>\n' +
'<div class="section">\n' +
'  Select a specific node for maintenance:\n' +
'  <select placeholder="Choose Node">\n' +
'    <option value="n1">Node 01 - Primary</option>\n' +
'    <option value="n2">Node 02 - Backup</option>\n' +
'  </select>\n' +
'</div>\n' +
'<a class="btn-primary" value="deploy_id_123">\n' +
'  Deploy Build\n' +
'  <confirm title="Are you sure?" confirm="Yes, Deploy" deny="Cancel">\n' +
'    This will trigger a production push.\n' +
'  </confirm>\n' +
'</a>\n' +
'<input type="date" value="2024-12-31" placeholder="Set Deadline" />\n' +
'<select class="overflow">\n' +
'  <option value="v_acc">View Analytics</option>\n' +
'  <option value="d_log">Download Logs</option>\n' +
'  <option value="c_adm" class="danger">Contact Admin</option>\n' +
'</select>\n' +
'<img src="https://api.slack.com" title="Traffic Analytics" alt="Graph" />\n' +
'<div class="context">\n' +
'  🕒 Last updated: <b>May 21, 2024</b>\n' +
'  |  🔐 Secure Session: <code>active</code>\n' +
'</div>';

console.log('--- USMM MASTER CONTROLLER ---');
const blocks = SlackFormatter.parse(masterInput);
console.log(JSON.stringify(blocks, null, 2));
