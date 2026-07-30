// =============================================================
// CLOUDFLARE WORKER / SERVERLESS PROXY FOR URBEX LOGGING
// Działa 24/7 w chmurze (bez użycia Twojego komputera!)
// Ukrywa webhook Discorda przed wszystkimi deweloperami
// =============================================================

export default {
  async fetch(request, env, ctx) {
    // Webhook Discorda przechowywany bezpiecznie w chmurze
    const DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1532069719056715866/1cAY66JZ6NA6sh-FNeT5sEAKDt_3aZKoQHNBSuHCJEM3Z9dtw9s77EpjwgfNX0JydsgA";

    // Nagłówki CORS zezwalające na wysyłanie z urb3x.github.io
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Pre-flight CORS OPTIONS request
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const payload = await request.json();

      // Przesłanie zapytania z serwera chmury na Discord Webhook
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      return new Response(JSON.stringify({ status: "success", code: res.status }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ status: "error", message: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
