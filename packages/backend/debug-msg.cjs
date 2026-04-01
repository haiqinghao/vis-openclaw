const fs = require('fs');

const filePath = 'C:\\Users\\49541\\.openclaw\\agents\\dev\\sessions\\df8cef76-2189-4498-b0fd-a8d91f757d86.jsonl';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

for (const line of lines.slice(0, 20)) {
  if (!line.trim()) continue;
  try {
    const record = JSON.parse(line);
    if (record.type === 'message' && record.message) {
      console.log('=== Message ===');
      console.log('Role:', record.message.role);
      console.log('Content:', JSON.stringify(record.message.content, null, 2));
      break;
    }
  } catch (e) {
    continue;
  }
}