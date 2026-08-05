const axios = require('axios');

async function run() {
  try {
    const res = await axios.get('https://nushaat.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    const html = res.data;
    const match = html.match(/<link[^>]+rel="icon"[^>]*>/i);
    console.log('Live Favicon Tag:', match ? match[0] : 'Not Found');
  } catch (err) {
    console.error('Failed to fetch nushaat.com:', err.message);
  }
}
run();
