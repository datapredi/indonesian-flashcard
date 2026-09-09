/**
 * Cloudflare Worker — FPT.AI Text-to-Speech proxy (for the flashcard app)
 * =====================================================================
 * 為什麼需要這個：
 *  - FPT.AI 的 TTS API (`api.fpt.ai`) 不允許瀏覽器直接呼叫（沒有 CORS 標頭），
 *    而且它是「非同步」的——先回一個網址，要等幾秒再去抓音檔。
 *  - 這個 Worker 幫忙：擋 CORS、處理輪詢、把 FPT api_key 藏在伺服器端
 *    （不會出現在瀏覽器）。多檔案 app 只要打這個 Worker、拿到 mp3 就好。
 *
 * 部署步驟（免費方案就夠）：
 *  1. 去 https://console.fpt.ai 註冊，開一個 Text-to-Speech 應用，複製 api_key。
 *  2. 去 https://dash.cloudflare.com → Workers & Pages → Create → Worker，
 *     把這整個檔案的內容貼進去，Deploy。
 *  3. Worker 設定 → Settings → Variables and Secrets →
 *     新增一個 Secret：名稱 FPT_API_KEY，值＝你的 FPT api_key。
 *  4. （可選）Settings → 新增 Variable：ALLOW_ORIGIN，值＝你放 flashcard
 *     的網址（例如 https://xxx.pages.dev）。不填就是允許任何來源（*）。
 *  5. 複製 Worker 網址（像 https://fpt-tts-proxy.你的帳號.workers.dev），
 *     貼到 flashcard「越南文 → FPT 南部腔」設定裡的那格。
 *
 * 用法（flashcard 會自己這樣打）：
 *   GET  https://.../ ?text=Xin%20chào&voice=lannhi&speed=0
 *   POST https://.../  body: {"text":"Xin chào","voice":"lannhi","speed":0}
 *   回傳：audio/mpeg 的 mp3 bytes（成功）或 JSON 錯誤訊息。
 *
 * 南部腔 voice：lannhi（女）、linhsan（女）。其他：banmai / leminh / myan /
 * thuminh / giahuy（不同區）。speed 範圍 -3 ~ 3（0 = 正常）。
 */

const FPT_ENDPOINT = "https://api.fpt.ai/hmi/tts/v5";
const POLL_TIMEOUT_MS = 25000;   // 最多等 FPT 產出音檔 25 秒
const POLL_INTERVAL_MS = 900;

export default {
  async fetch(request, env) {
    const allowOrigin = env.ALLOW_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const jsonErr = (status, message) =>
      new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (!env.FPT_API_KEY) {
      return jsonErr(500, "Worker 沒有設定 FPT_API_KEY secret");
    }

    // ---- 取參數（GET query 或 POST JSON 都支援）----
    let text = "", voice = "lannhi", speed = "0";
    try {
      if (request.method === "POST") {
        const ct = request.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const b = await request.json();
          text = String(b.text || "");
          if (b.voice) voice = String(b.voice);
          if (b.speed !== undefined) speed = String(b.speed);
        } else {
          text = await request.text();
        }
      }
      const u = new URL(request.url);
      if (!text && u.searchParams.get("text")) text = u.searchParams.get("text");
      if (u.searchParams.get("voice")) voice = u.searchParams.get("voice");
      if (u.searchParams.get("speed")) speed = u.searchParams.get("speed");
    } catch (e) {
      return jsonErr(400, "讀取請求內容失敗：" + e.message);
    }

    text = text.trim();
    if (!text) return jsonErr(400, "缺少 text");
    if (text.length > 5000) text = text.slice(0, 5000);

    // ---- 1) 呼叫 FPT，拿非同步網址（免費方案有 rate limit，撞到就等一下重試）----
    let fptJson;
    const callFpt = async () => {
      const r = await fetch(FPT_ENDPOINT, {
        method: "POST",
        headers: {
          "api_key": env.FPT_API_KEY,
          "voice": voice,
          "speed": String(speed),
          "format": "mp3",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: text,
      });
      const bodyText = await r.text();
      let j;
      try { j = JSON.parse(bodyText); }
      catch { return { fatal: "FPT 回應不是 JSON：" + bodyText.slice(0, 300) }; }
      const msg = String(j.message || j.error || "");
      const rateLimited = r.status === 429 || /rate limit|too many/i.test(msg);
      if (r.ok && !j.error) return { ok: j };
      return { rateLimited, err: "FPT 錯誤：" + (j.message || j.error || r.status) };
    };
    try {
      let res = await callFpt();
      // rate limit 通常是「每秒/每分鐘幾次」的突發限制，隔幾秒再試多半就過了
      for (let i = 0; i < 3 && res.rateLimited; i++) {
        await new Promise((r) => setTimeout(r, 3500));
        res = await callFpt();
      }
      if (res.fatal) return jsonErr(502, res.fatal);
      if (!res.ok) return jsonErr(res.rateLimited ? 429 : 502, res.err);
      fptJson = res.ok;
    } catch (e) {
      return jsonErr(502, "呼叫 FPT 失敗：" + e.message);
    }

    const asyncUrl = fptJson.async;
    if (!asyncUrl) return jsonErr(502, "FPT 沒有回 async 網址：" + JSON.stringify(fptJson).slice(0, 300));

    // ---- 2) 輪詢 async 網址，直到音檔產好 ----
    const started = Date.now();
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      try {
        const a = await fetch(asyncUrl, { cf: { cacheTtl: 0 } });
        if (a.ok) {
          const ct = (a.headers.get("content-type") || "").toLowerCase();
          const buf = await a.arrayBuffer();
          // 產好之前 S3 可能回 0 bytes 或一小段 XML；音檔才會是像樣的大小。
          if ((ct.includes("audio") || ct.includes("octet-stream") || ct.includes("mpeg")) && buf.byteLength > 800) {
            return new Response(buf, {
              status: 200,
              headers: {
                ...cors,
                "Content-Type": "audio/mpeg",
                "Cache-Control": "public, max-age=86400",
              },
            });
          }
          if (buf.byteLength > 2000 && !ct.includes("xml")) {
            return new Response(buf, {
              status: 200,
              headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
            });
          }
        }
      } catch (e) { /* 還沒好，繼續等 */ }
      await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
    }
    return jsonErr(504, "等 FPT 產音檔逾時（25 秒）");
  },
};
