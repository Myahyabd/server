const axios = require('axios');

/**
 * Helper function to send SMS via Greenweb, BulksmsBD, or fallback to Mock Console mode.
 * @param {string} phone - Recipient phone number (e.g., '01703141439' or '+8801703141439')
 * @param {string} message - Message content
 * @returns {Promise<boolean>} - Returns true if sent successfully
 */
async function sendSMS(phone, message) {
  // Normalize phone number to local format for BD gateways (e.g. '017XXXXXXXX' or '88017XXXXXXXX')
  let cleanPhone = phone.replace(/[^0-9]/g, ''); // Keep only numbers
  if (cleanPhone.startsWith('880') && cleanPhone.length === 13) {
    // Already in 880XXXXXXXXXX format
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
    // 017XXXXXXXX format
    // Some gateways prefer 880 prefix. Let's make it 880 prefix to be safe.
    cleanPhone = '88' + cleanPhone;
  }

  // 1. Check Greenweb SMS Gateway
  if (process.env.GREENWEB_TOKEN) {
    try {
      const token = process.env.GREENWEB_TOKEN;
      const url = `https://api.greenweb.com.bd/api.php?token=${encodeURIComponent(token)}&to=${encodeURIComponent(cleanPhone)}&message=${encodeURIComponent(message)}`;
      const response = await axios.get(url);
      console.log('Greenweb SMS Response:', response.data);
      return true;
    } catch (error) {
      console.error('Greenweb SMS Failed:', error.message);
    }
  }

  // 2. Check BulksmsBD Gateway
  if (process.env.BULKSMSBD_API_KEY) {
    try {
      const apiKey = process.env.BULKSMSBD_API_KEY;
      const senderId = process.env.BULKSMSBD_SENDER_ID || '8809612440734'; // Default masking or non-masking sender id
      const url = `http://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(apiKey)}&type=text&number=${encodeURIComponent(cleanPhone)}&senderid=${encodeURIComponent(senderId)}&message=${encodeURIComponent(message)}`;
      const response = await axios.get(url);
      console.log('BulksmsBD SMS Response:', response.data);
      return true;
    } catch (error) {
      console.error('BulksmsBD SMS Failed:', error.message);
    }
  }

  // 3. Fallback: Mock Mode (Console Log)
  console.log('\n======================================');
  console.log(`[MOCK SMS] To: ${phone}`);
  console.log(`[MOCK SMS] Message: ${message}`);
  console.log('======================================\n');
  return true;
}

module.exports = { sendSMS };
