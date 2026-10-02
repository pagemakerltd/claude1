// เรียก Claude API จาก service worker (ไม่เอา API key ไปไว้ในหน้าเว็บ)
const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULTS = { model: "claude-opus-5-5", language: "th" };

const cache = new Map(); // term|language|model -> คำอธิบาย (อยู่แค่ตอน service worker ยังทำงาน)

const LANGUAGE_NAMES = { th: "ภาษาไทย", en: "English" };

function buildSystemPrompt(language) {
  return (
    "You explain technical terms, jargon and proper nouns that a reader highlighted on a web page. " +
    `Answer in ${LANGUAGE_NAMES[language] || LANGUAGE_NAMES.th}. ` +
    "Give a short, plain explanation in at most 3 sentences: what it is and what it is used for. " +
    "Keep well-known technical words in English where natural. " +
    "Use the surrounding page context only to pick the right meaning. " +
    "If the selection is not a term worth explaining, or you are not sure what it refers to, say so briefly instead of guessing. " +
    "No headings, no bullet lists, no markdown."
  );
}

async function explain({ term, context }) {
  const { apiKey, model, language } = await chrome.storage.local.get([
    "apiKey",
    "model",
    "language",
  ]);
  if (!apiKey) return { error: "no-key" };

  const useModel = model || DEFAULTS.model;
  const lang = language || DEFAULTS.language;
  const cacheKey = `${term}|${lang}|${useModel}`;
  if (cache.has(cacheKey)) return { text: cache.get(cacheKey) };

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 1500,
        // Haiku 4.5 ไม่รองรับพารามิเตอร์ effort (ส่งไปจะเกิด error 400)
        ...(useModel.includes("haiku") ? {} : { output_config: { effort: "low" } }),
        system: buildSystemPrompt(lang),
        messages: [
          {
            role: "user",
            content: `Term: ${term}\n\nSurrounding page text:\n${context || "(none)"}`,
          },
        ],
      }),
    });
  } catch {
    return { error: "network" };
  }

  if (!res.ok) {
    if (res.status === 401) return { error: "bad-key" };
    if (res.status === 429) return { error: "rate-limit" };
    return { error: "api", status: res.status };
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") return { error: "refusal" };

  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) return { error: "empty" };

  cache.set(cacheKey, text);
  return { text };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "explain") return false;
  explain(msg).then(sendResponse);
  return true; // ตอบกลับแบบ async
});
