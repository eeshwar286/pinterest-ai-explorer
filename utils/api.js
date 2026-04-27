// utils/api.js
// Google Gemini API integration for Pinterest AI Explorer.
// Exposes window.PAE_Api.getSuggestions(query, previousQueries)

(function () {
  const CFG = window.PAE_Config;

  function fallbackSuggestions(query) {
    const q = (query || "").trim();
    if (!q) return [];
    return [
      `${q} ideas`,
      `${q} aesthetic`,
      `${q} inspiration`,
    ];
  }

  // Try hard to coerce Gemini's text output into an array of suggestion strings.
  function parseSuggestions(text) {
    if (!text) return [];
    // 1. Strip code fences if present
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    // 2. Try direct JSON parse
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string");
    } catch {}

    // 3. Try to extract a JSON array substring
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string");
      } catch {}
    }

    // 4. Fallback: split by newline, strip bullets/numbering/quotes
    return cleaned
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^\s*[-*•\d.]+\s*/, "")
          .replace(/^["']|["']$/g, "")
          .trim()
      )
      .filter((line) => line.length > 0 && line.length < 80);
  }

  async function getSuggestions(query, previousQueries) {
    const apiKey = await CFG.getApiKey();
    if (!apiKey) {
      console.warn("[PAE] No Gemini API key set. Using fallback.");
      return {
        suggestions: fallbackSuggestions(query),
        usedFallback: true,
        error: "No API key set. Open the extension popup and paste your Gemini key.",
      };
    }

    const prevList =
      previousQueries && previousQueries.length
        ? previousQueries.join(", ")
        : "none";

    const promptText = `Given the search query: "${query}", and previous searches: ${prevList}, generate 8-10 creative Pinterest search suggestions. Include broader, niche, and adjacent ideas. Each suggestion should be 2-6 words, natural Pinterest phrasing, no punctuation or numbering. AVOID just appending words to the original query — explore different angles, related themes, subcultures, aesthetics, mediums, and unexpected tangents. Return ONLY a JSON array of strings.`;

    const body = {
      contents: [
        {
          parts: [{ text: promptText }],
        },
      ],
    };

    try {
      const res = await fetch(`${CFG.GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[PAE] Gemini error:", res.status, text);
        let reason = `Gemini ${res.status}`;
        try {
          const j = JSON.parse(text);
          if (j?.error?.message) reason = j.error.message;
        } catch {}
        return {
          suggestions: fallbackSuggestions(query),
          usedFallback: true,
          error: reason,
        };
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const suggestions = parseSuggestions(text).slice(0, 10);

      if (!suggestions.length) {
        return {
          suggestions: fallbackSuggestions(query),
          usedFallback: true,
          error: "Gemini returned no usable suggestions.",
        };
      }
      return { suggestions, usedFallback: false };
    } catch (err) {
      console.error("[PAE] Fetch failed:", err);
      return {
        suggestions: fallbackSuggestions(query),
        usedFallback: true,
        error: err?.message || "Network error calling Gemini.",
      };
    }
  }

  window.PAE_Api = { getSuggestions, fallbackSuggestions };
})();
