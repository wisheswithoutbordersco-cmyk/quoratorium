/**
 * CAPTAIN Q BACKEND v2 — QUORATORIUM ENHANCEMENTS
 * Drop this into your Railway app (Quoratorium)
 * 
 * Features:
 *   POST /api/analyze-image         → Upload image, get detailed prompt
 *   POST /api/tts                   → Text to speech (MP3)
 *   POST /api/generate-image        → Direct image gen (fal.ai / OpenAI)
 *   POST /api/studio/generate       → Proxy to your Production Studio
 *   POST /api/social/queue          → Queue post for IG/TikTok/Threads/FB
 *   GET  /api/social/pending        → Make.com polls this for new posts
 *   POST /api/social/mark-posted    → Make.com marks a post as done
 * 
 * Env vars needed:
 *   OPENROUTER_API_KEY
 *   OPENAI_API_KEY
 *   FAL_API_KEY              (optional)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   PRODUCTION_STUDIO_URL    (e.g. https://wish-production-studio-production.up.railway.app )
 *   MAKE_WEBHOOK_URL         (optional, for social automation)
 */

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const FormData = require('form-data');

const router = express.Router();
console.log('>>> CAPTAIN Q ROUTER LOADED <<<');
router.get('/api/test', (req, res) => res.json({ ok: true, message: 'Captain Q is alive' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
let supabase = null;
try {
  const sbUrl = process.env.SUPABASE_URL || '';
  const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (sbUrl && sbKey) {
    supabase = createClient(sbUrl, sbKey);
    console.log('[Captain Q] Supabase connected');
  } else {
    console.warn('[Captain Q] Supabase not configured — social queue disabled');
  }
} catch (e) {
  console.warn('[Captain Q] Supabase init failed:', e.message);
}





// ───────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────
function handleError(res, err, context) {
  console.error(`[${context}] ERROR:`, err.response?.data || err.message);
  res.status(500).json({ 
    error: `${context} failed`, 
    details: err.message,
    tip: err.message.includes('API key') ? 'Check your API key in Railway env vars' : undefined
  });
}

// ───────────────────────────────────────────────
// 1. IMAGE → PROMPT (Vision Analysis)
// ───────────────────────────────────────────────
router.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert prompt engineer for printable wall art and POD designs.
Analyze the uploaded image and write a detailed text-to-image prompt that could recreate it.

Output format:
1. Brief description of what the image shows
2. The full prompt (comma-separated keywords, optimized for image generators)
3. Suggested negative prompt
4. Recommended aspect ratio and style tags

Include: subject, lighting, color palette, mood, art style, composition, texture details.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this image and give me a detailed prompt I can use to recreate or remix it for my wall art store.' },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://quoratorium.com',
          'X-Title': 'Quoratorium'
        }
      }
    );

    res.json({ success: true, analysis: response.data.choices[0].message.content });

  } catch (err) { handleError(res, err, 'Vision analysis'); }
});

// ───────────────────────────────────────────────
// 2. TEXT-TO-SPEECH (Voice for driving)
// ───────────────────────────────────────────────
router.post('/api/tts', express.json(), async (req, res) => {
  try {
    const { text, voice = 'onyx', speed = 1.0 } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const response = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      { model: 'tts-1', voice, input: text, speed, response_format: 'mp3' },
      {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        responseType: 'stream'
      }
    );

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="captain-q.mp3"');
    response.data.pipe(res);

  } catch (err) { handleError(res, err, 'TTS'); }
});

// ───────────────────────────────────────────────
// 3. IMAGE GENERATION (Direct — fal.ai or OpenAI)
// ───────────────────────────────────────────────
router.post('/api/generate-image', express.json(), async (req, res) => {
  try {
    const { prompt, provider = 'fal', aspect_ratio = '1:1' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    let imageUrl, metadata = {};

    if (provider === 'openai') {
      const openaiBase = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      const response = await axios.post(
        `${openaiBase}/images/generations`,
        { model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'auto' },
        { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }
      );
      imageUrl = response.data.data[0].url;
      metadata = { revised_prompt: response.data.data[0].revised_prompt, provider: 'dall-e-3' };

    } else {
      if (!process.env.FAL_API_KEY) return res.status(400).json({ error: 'FAL_API_KEY not set' });

      const sizeMap = { '1:1': 'square', '16:9': 'landscape_16_9', '9:16': 'portrait_16_9', '4:3': 'landscape_4_3' };

      const submit = await axios.post(
        'https://queue.fal.run/fal-ai/flux-pro/v1.1',
        { prompt, image_size: sizeMap[aspect_ratio] || 'square', num_inference_steps: 28, guidance_scale: 3.5 },
        { headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}`, 'Content-Type': 'application/json' } }
      );

      const requestId = submit.data.request_id;
      let result, attempts = 0;
      while (attempts < 30) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await axios.get(
          `https://queue.fal.run/fal-ai/flux-pro/v1.1/requests/${requestId}/status`,
          { headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}` } }
        );
        if (status.data.status === 'COMPLETED') {
          result = await axios.get(
            `https://queue.fal.run/fal-ai/flux-pro/v1.1/requests/${requestId}`,
            { headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}` } }
          );
          break;
        }
        attempts++;
      }
      imageUrl = result.data.images[0].url;
      metadata = { provider: 'fal-flux-pro', seed: result.data.seed };
    }

    // Save to Supabase Storage
    if (imageUrl) {
      try {
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const fileName = `generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const { error: upErr } = await supabase.storage.from('wall-art').upload(fileName, imgRes.data, { contentType: 'image/png' });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('wall-art').getPublicUrl(fileName);
          imageUrl = publicUrl;
          metadata.hosted = 'supabase';
        }
      } catch (e) { console.warn('Storage upload failed, using original URL'); }
    }

    res.json({ success: true, imageUrl, metadata, prompt });

  } catch (err) { handleError(res, err, 'Image generation'); }
});

// ───────────────────────────────────────────────
// 4. PRODUCTION STUDIO PROXY
// Call your existing studio from Captain Q
// ───────────────────────────────────────────────
router.post('/api/studio/generate', express.json(), async (req, res) => {
  try {
    const { prompt, pages = 1, upscale = true, watermark = 'Off' } = req.body;
    if (!process.env.PRODUCTION_STUDIO_URL) {
      return res.status(400).json({ error: 'PRODUCTION_STUDIO_URL not set in env vars' });
    }

    // Adjust this payload to match what your Production Studio expects
    const studioPayload = {
      prompt,
      pages,
      upscale,
      watermark,
      format: 'pdf'
    };

    const response = await axios.post(
      `${process.env.PRODUCTION_STUDIO_URL}/api/generate`,  // adjust endpoint if different
      studioPayload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 180000 }
    );

    res.json({ success: true, studioResponse: response.data });

  } catch (err) { 
    console.error('Studio proxy error:', err.message);
    res.status(502).json({ 
      error: 'Production Studio unreachable', 
      details: err.message,
      tip: 'Make sure PRODUCTION_STUDIO_URL is correct and the studio is running on Railway'
    }); 
  }
});

// ───────────────────────────────────────────────
// 5. SOCIAL MEDIA QUEUE
// Captain Q prepares posts; Make.com (or you) picks them up
// ───────────────────────────────────────────────

// Create the social_queue table in Supabase first:
// CREATE TABLE social_queue (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   platform text NOT NULL CHECK (platform IN ('instagram','tiktok','threads','facebook')),
//   image_url text,
//   caption text,
//   hashtags text,
//   status text DEFAULT 'pending',
//   created_at timestamptz DEFAULT now(),
//   posted_at timestamptz
// );

router.post('/api/social/queue', express.json(), async (req, res) => {
  try {
    const { platform, image_url, caption, hashtags } = req.body;
    if (!platform || !caption) return res.status(400).json({ error: 'platform and caption required' });

    const { data, error } = await supabase
      .from('social_queue')
      .insert([{ platform, image_url, caption, hashtags, status: 'pending' }])
      .select()
      .single();

    if (error) throw error;

    // If Make.com webhook is configured, ping it
    if (process.env.MAKE_WEBHOOK_URL) {
      try {
        await axios.post(process.env.MAKE_WEBHOOK_URL, { postId: data.id, platform, image_url, caption, hashtags }, { timeout: 10000 });
      } catch (webhookErr) {
        console.warn('Make.com webhook failed (non-critical):', webhookErr.message);
      }
    }

    res.json({ success: true, queued: data });

  } catch (err) { handleError(res, err, 'Social queue'); }
});

// Make.com polls this to get pending posts
router.get('/api/social/pending', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('social_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw error;
    res.json({ success: true, posts: data });

  } catch (err) { handleError(res, err, 'Fetch pending posts'); }
});

// Make.com calls this after posting
router.post('/api/social/mark-posted', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    const { data, error } = await supabase
      .from('social_queue')
      .update({ status: 'posted', posted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, post: data });

  } catch (err) { handleError(res, err, 'Mark posted'); }
});

// ───────────────────────────────────────────────
// TOOL SCHEMAS — Feed this into Captain Q's system
// so he knows when to use each capability
// ───────────────────────────────────────────────
const CAPTAIN_Q_TOOLS = [
  {
    name: 'analyze_image',
    description: 'When the user uploads a reference image, analyze it and write a detailed text-to-image prompt. Use this BEFORE generating anything.',
    parameters: { type: 'object', properties: { image_base64: { type: 'string' } }, required: ['image_base64'] }
  },
  {
    name: 'speak_text',
    description: 'Convert text to speech so the user can listen while driving or multitasking. Use when the user says "speak it", "read it aloud", or mentions driving.',
    parameters: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string', enum: ['alloy','echo','fable','onyx','nova','shimmer'], default: 'onyx' } }, required: ['text'] }
  },
  {
    name: 'generate_image',
    description: 'Generate an image from a text prompt. Use fal.ai (provider: fal) for highest quality wall art. Use OpenAI (provider: openai) for speed. Always confirm the prompt with the user before generating if they did not explicitly say "generate it".',
    parameters: { type: 'object', properties: { prompt: { type: 'string' }, provider: { type: 'string', enum: ['fal','openai'], default: 'fal' }, aspect_ratio: { type: 'string', enum: ['1:1','16:9','9:16','4:3'], default: '1:1' } }, required: ['prompt'] }
  },
  {
    name: 'studio_generate',
    description: 'Send a prompt to the Production Studio for full PDF packaging with watermark, upscale, and print-ready output. Use this when the user wants a FINAL product for sale, not just a draft.',
    parameters: { type: 'object', properties: { prompt: { type: 'string' }, pages: { type: 'number', default: 1 }, upscale: { type: 'boolean', default: true }, watermark: { type: 'string', enum: ['WWB','LDW','Off'], default: 'Off' } }, required: ['prompt'] }
  },
  {
    name: 'queue_social_post',
    description: 'Queue a post for Instagram, TikTok, Threads, or Facebook. Captain Q will write the caption and hashtags. Use this when the user says "post this" or wants to share a design.',
    parameters: { type: 'object', properties: { platform: { type: 'string', enum: ['instagram','tiktok','threads','facebook'] }, image_url: { type: 'string' }, caption: { type: 'string' }, hashtags: { type: 'string' } }, required: ['platform','caption'] }
  }
];

module.exports = { router, CAPTAIN_Q_TOOLS };

/*
══════════════════════════════════════════════════════════════════
SETUP INSTRUCTIONS
══════════════════════════════════════════════════════════════════

1. INSTALL:
   npm install multer axios @supabase/supabase-js form-data

2. WIRE INTO YOUR EXPRESS APP:
   const { router: cqRouter, CAPTAIN_Q_TOOLS } = require('./captain-q-v2');
   app.use(cqRouter);

   // Pass CAPTAIN_Q_TOOLS to your OpenRouter function-calling setup
   // so Captain Q knows what he can do.

3. ENV VARS (Railway Dashboard):
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENAI_API_KEY=sk-...
   FAL_API_KEY=...                    (optional, for direct image gen)
   SUPABASE_URL=https://...supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   PRODUCTION_STUDIO_URL=https://wish-production-studio-production.up.railway.app
   MAKE_WEBHOOK_URL=https://hook.make.com/...   (optional)

4. SUPABASE SETUP:
   A. Create bucket "wall-art" (public)
   B. Run this SQL to create the social queue table:

   CREATE TABLE social_queue (
     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     platform text NOT NULL CHECK (platform IN ('instagram','tiktok','threads','facebook')),
     image_url text,
     caption text NOT NULL,
     hashtags text,
     status text DEFAULT 'pending',
     created_at timestamptz DEFAULT now(),
     posted_at timestamptz
   );

5. SOCIAL MEDIA AUTOMATION (Make.com route):

   a) Sign up at make.com
   b) Create a scenario:
      Trigger: Webhook → copy the webhook URL, paste it into MAKE_WEBHOOK_URL env var
      Action: Instagram / TikTok / Facebook → "Publish a post"
      Action: HTTP → POST to your /api/social/mark-posted to mark it done

   c) Alternative (no webhook): Make.com polls /api/social/pending every 15 minutes
      Then posts whatever is pending, then calls /api/social/mark-posted

6. PRODUCTION STUDIO INTEGRATION:
   If your studio has a different API endpoint than /api/generate,
   update the studioProxy route above to match.

   Common Manus-built endpoints:
   - POST /api/generate
   - POST /api/create
   - POST /api/quick-create

   Check your Production Studio source code or ask me to help you find it.

7. COSTS:
   - Vision analysis: ~$0.005/image
   - TTS: ~$0.015 per 1K chars
   - DALL-E 3: $0.04/image
   - fal.ai Flux Pro: ~$0.035/image
   - Production Studio: whatever you're already paying (15¢/image)
   - Make.com: ~$9/month for basic plan

══════════════════════════════════════════════════════════════════
*/
