/**
 * Cloudflare Worker — ElevenLabs Text-to-Speech proxy (for the flashcard app)
 * =========================================================================
 * 為什麼需要這個：
 *  - 把 ElevenLabs API key 藏在伺服器端（不會出現在瀏覽器）。
 *  - 保證 CORS，讓純前端的 flashcard 能直接抓 mp3。
 *  - ElevenLabs 是同步的：POST 過去直接回音檔，不用像 FPT 那樣輪詢。
 *
 * 部署步驟（免費方案就能先試）：
 *  1. 去 https://elevenlabs.io 註冊。免費方案每月 10,000 credits（約 10 分鐘）
 *     可以先試克隆的南部腔音質；覺得可以再升 Starter（約 US$5/月、30,000 credits、
 *     含 Instant Voice Cloning、可商用）。
 *  2. （南部腔）ElevenLabs → Voices → Add a new voice → Instant Voice Cloning，
 *     上傳一段 1~2 分鐘、乾淨的越南南部人講話音訊（老師的錄音、或 YouTube 片段）。
 *     建好之後複製那個 voice 的 ID（在 voice 設定頁，或 Voices 清單）。
 *  3. ElevenLabs → 右上角頭像 → Profile → API Keys → 複製 key。
 *  4. 去 https://dash.cloudflare.com → Workers & Pages → Create → Worker，
 *     把這整個檔案貼進去 → Deploy。
 *  5. Worker → Settings → Variables and Secrets →
 *     新增 Secret：名稱 XI_API_KEY，值＝你的 ElevenLabs API key。
 *  6. （可選）新增 Variable：ALLOW_ORIGIN＝你放 flashcard 的網址，不填＝*。
 *  7. 複製 Worker 網址，貼到 flashcard「越南文 → 南部腔 TTS」設定的網址那格，
 *     voice ID 那格填步驟 2 的 voice ID。
 *
 * 用法（flashcard 會自己這樣打）：
 *   GET  https://.../ ?text=Xin%20chào&voice=<voiceId>
 *   POST https://.../  body: {"text":"Xin chào","voice":"<voiceId>"}
 *   回傳：audio/mpeg（成功）或 JSON 錯誤訊息。
 */

const XI_BASE = "https://api.elevenlabs.io/v1/text-to-speech/";
const MODEL_ID = "eleven_multilingual_v2"; // 支援越南文
const OUTPUT_FORMAT = "mp3_44100_128";

export default {
  async fetch(request, env) {
    const allowOrigin = env.ALLOW_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const jsonErr = (status, message) =>
      new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (!env.XI_API_KEY) return jsonErr(500, "Worker 沒有設定 XI_API_KEY secret");

    let text = "", voice = "";
    try {
      if (request.method === "POST") {
        const ct = request.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const b = await request.json();
          text = String(b.text || "");
          voice = String(b.voice || "");
        } else {
          text = await request.text();
        }
      }
      const u = new URL(request.url);
      if (!text && u.searchParams.get("text")) text = u.searchParams.get("text");
      if (!voice && u.searchParams.get("voice")) voice = u.searchParams.get("voice");
    } catch (e) {
      return jsonErr(400, "讀取請求內容失敗：" + e.message);
    }

    text = text.trim();
    voice = voice.trim();
    if (!text) return jsonErr(400, "缺少 text");
    if (!voice) return jsonErr(400, "缺少 voice（ElevenLabs voice ID）");
    if (text.length > 5000) text = text.slice(0, 5000);

    try {
      const r = await fetch(XI_BASE + encodeURIComponent(voice) + "?output_format=" + OUTPUT_FORMAT, {
        method: "POST",
        headers: {
          "xi-api-key": env.XI_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: { stability: 0.5, similarity_boost: 0.85 },
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        return jsonErr(r.status === 429 ? 429 : 502, "ElevenLabs 錯誤 " + r.status + "：" + t.slice(0, 400));
      }
      const buf = await r.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
      });
    } catch (e) {
      return jsonErr(502, "呼叫 ElevenLabs 失敗：" + e.message);
    }
  },
};
