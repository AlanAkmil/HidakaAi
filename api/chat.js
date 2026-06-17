import crypto from 'node:crypto';

const BASE = 'https://www.chatday.ai';

const UAS = [
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
];

const LANGS = ['id', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'vi', 'th', 'it', 'nl'];

const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function signIn() {
    await sleep(300 + Math.random() * 800);
    const r = await fetch(`${BASE}/api/auth/sign-in/anonymous`, {
        method: 'POST',
        headers: {
            'User-Agent': pick(UAS),
            Origin: BASE,
            Referer: `${BASE}/chat`,
            'Content-Type': 'application/json',
            'Accept-Language': pick(LANGS)
        },
        body: '{}'
    });
    if (!r.ok) throw new Error('Auth gagal: ' + r.status);
    const setCookie = r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie')].filter(Boolean);
    return {
        cookie: setCookie.map(c => c.split(';')[0]).join('; '),
        ...(await r.json())
    };
}

async function listModels() {
    const { cookie } = await signIn();
    const r = await fetch(`${BASE}/api/v2/models`, {
        headers: {
            'User-Agent': pick(UAS),
            Origin: BASE,
            Referer: `${BASE}/chat`,
            Cookie: cookie,
            'Accept': 'application/json',
            'Accept-Language': pick(LANGS)
        }
    });
    if (!r.ok) return { error: `Gagal: ${r.status}` };
    const data = await r.json();
    const models = (data.models || data || []).map(m => ({
        id: m.id || m,
        name: m.name || m.id || m,
        provider: m.provider || null
    }));
    return { total: models.length, models };
}

async function chat(prompt, model = 'openai/gpt-5.5') {
    const { cookie } = await signIn();
    const vid = crypto.randomUUID().replace(/-/g, '');
    const cid = Array(16).fill(0).map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
    
    const r = await fetch(`${BASE}/api/v2/chat/anonymous`, {
        method: 'POST',
        headers: {
            'User-Agent': pick(UAS),
            Origin: BASE,
            Referer: `${BASE}/chat`,
            'Content-Type': 'application/json',
            Cookie: cookie,
            Accept: 'text/event-stream',
            'Accept-Language': pick(LANGS)
        },
        body: JSON.stringify({
            content: prompt,
            model,
            visitorId: vid,
            conversationId: cid
        })
    });

    if (!r.ok) return { status: r.status, error: (await r.text()).substring(0, 300) };

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
                const evt = JSON.parse(payload);
                if (evt.type === 'text-delta' && typeof evt.delta === 'string') full += evt.delta;
            } catch {}
        }
    }

    return { model, response: full.trim() };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, prompt, model } = req.method === 'GET' ? req.query : req.body;

    try {
        if (action === 'models') {
            const result = await listModels();
            return res.json({ creator: 'OxyX', ...result });
        }

        if (!prompt) {
            return res.json({ error: 'Prompt wajib diisi' });
        }

        const result = await chat(prompt, model || 'openai/gpt-5.5');
        return res.json({ creator: 'OxyX', status: 200, ...result });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}