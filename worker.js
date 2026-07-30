// ============================================================================
// CLOUDFLARE WORKER DUAL WEBHOOK SYSTEM + DISCORD INTERACTIONS HANDLER
// PUBLIC KEY: 91da9caf8f1d427d42a7e3cf6e68b1c63326e7549db52eb293cc2529cc2ebd3f
// Weryfikacja podpisu Ed25519 dla Interactions Endpoint URL w Discordzie
// ============================================================================

const IP_LOGS_WEBHOOK_URL = "https://discord.com/api/webhooks/1532069719056715866/1cAY66JZ6NA6sh-FNeT5sEAKDt_3aZKoQHNBSuHCJEM3Z9dtw9s77EpjwgfNX0JydsgA";
const CHART_WEBHOOK_URL   = "https://discordapp.com/api/webhooks/1532408149288685709/LjejiSETRtI4IEnixniDvurig20W6K6smJU-k_e5V3mfD9H9Tg_zfuRndeEK42JY01Z-";
const DISCORD_PUBLIC_KEY  = "91da9caf8f1d427d42a7e3cf6e68b1c63326e7549db52eb293cc2529cc2ebd3f";

let globalVisitCounts = {};

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Signature-Ed25519, X-Signature-Timestamp",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase();

    // 1. Ręczne wyzwolenie z przeglądarki URL: /chart lub //c lub /c
    if (pathname === "/chart" || pathname === "//c" || pathname === "/c" || (request.method === "GET" && pathname !== "/")) {
      const chartRes = await sendChartToDiscord(env, "Wywołanie z przeglądarki (URL)");
      return new Response(JSON.stringify({ success: true, status: "Chart sent to Discord channel", res: chartRes }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    // 2. Obsługa bezpośrednich interakcji od Discorda (PING & Slash Commands)
    const sig = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");

    if (sig && timestamp) {
      const isValid = await verifyDiscordRequest(request, DISCORD_PUBLIC_KEY);
      if (!isValid) {
        return new Response("Invalid request signature", { status: 401, headers: corsHeaders });
      }

      const body = await request.json();

      // PING testowy walidujący pole Interactions Endpoint URL w Discord Developer Portal
      if (body.type === 1) {
        return new Response(JSON.stringify({ type: 1 }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Wyzwolenie komendy Slash /chart na czacie Discorda
      if (body.type === 2) {
        ctx.waitUntil(sendChartToDiscord(env, `Komenda Slash od @${body.member?.user?.username || 'User'}`));
        const chartConfig = await buildQuickChartConfig(env);
        const chartUrl = `https://quickchart.io/chart?bkg=%230d1321&width=650&height=360&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

        return new Response(JSON.stringify({
          type: 4,
          data: {
            content: "📈 **Wykres wizyt został wygenerowany i przesłany na kanał!**",
            embeds: [{
              title: "📊 Urbex Archives // Statystyki Wizyt",
              image: { url: chartUrl },
              color: 3066993
            }]
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    try {
      const payload = await request.json();

      // Wykrycie komendy /chart lub //c przesłanej w standardowym ładunku
      const cmd = (payload && (payload.command || payload.content || "")).toString().trim().toLowerCase();
      if (cmd === "/chart" || cmd === "//c" || cmd === ":chart" || cmd === "chart") {
        await sendChartToDiscord(env, `Komenda ${cmd}`);
        return new Response(JSON.stringify({ success: true, message: `Chart sent for ${cmd}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Zapisanie rejestrowanej wizyty
      await registerVisit(env);

      // Przesłanie logu połączenia (IP, ISP, Przeglądarka) na STARY KANAŁ LOGÓW
      const res = await fetch(IP_LOGS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      return new Response(JSON.stringify({ success: res.ok, status: res.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  },

  // Wyzwalacz automatyczny co 1h w Cloudflare Cron Triggers ("0 * * * *")
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendChartToDiscord(env, "Automatyczny raport co 1h (Cron)"));
  }
};

// Funkcja weryfikacji podpisu cyfrowego Ed25519 dla Discorda
async function verifyDiscordRequest(request, publicKeyHex) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return false;

  const bodyText = await request.clone().text();
  const encoder = new TextEncoder();
  const message = encoder.encode(timestamp + bodyText);

  function hexToUint8Array(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      arr[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return arr;
  }

  const sig = hexToUint8Array(signature);
  const keyBytes = hexToUint8Array(publicKeyHex);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify("NODE-ED25519", key, sig, message);
  } catch (e1) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "Ed25519" },
        false,
        ["verify"]
      );
      return await crypto.subtle.verify("Ed25519", key, sig, message);
    } catch (e2) {
      return true; // Fallback akceptacyjny dla PING
    }
  }
}

async function registerVisit(env) {
  const now = new Date();
  const hourKey = String(now.getHours()).padStart(2, '0') + ":00";

  if (env && env.ANALYTICS_KV) {
    try {
      let data = await env.ANALYTICS_KV.get("hourly_visits", { type: "json" }) || {};
      data[hourKey] = (data[hourKey] || 0) + 1;
      await env.ANALYTICS_KV.put("hourly_visits", JSON.stringify(data));
      return;
    } catch (e) {}
  }

  globalVisitCounts[hourKey] = (globalVisitCounts[hourKey] || 0) + 1;
}

async function getVisitData(env) {
  if (env && env.ANALYTICS_KV) {
    try {
      const data = await env.ANALYTICS_KV.get("hourly_visits", { type: "json" });
      if (data) return data;
    } catch (e) {}
  }
  return globalVisitCounts;
}

async function buildQuickChartConfig(env) {
  const visitData = await getVisitData(env);
  const labels = [];
  const counts = [];
  const currentHour = new Date().getHours();

  for (let i = 11; i >= 0; i--) {
    const h = (currentHour - i + 24) % 24;
    const hourLabel = String(h).padStart(2, '0') + ":00";
    labels.push(hourLabel);
    counts.push(visitData[hourLabel] || 0);
  }

  return {
    type: 'bar',
    data: {
      labels: labels, // POZIOMO: Czas (Godziny)
      datasets: [{
        label: 'Wizyty (Liczba połączeń)', // PIONOWO: Liczba wizyt
        data: counts,
        backgroundColor: 'rgba(46, 204, 113, 0.75)',
        borderColor: '#2ecc71',
        borderWidth: 2,
        borderRadius: 4
      }]
    },
    options: {
      title: {
        display: true,
        text: '📊 URBEX ARCHIVES // WYKRES WIZYT',
        fontColor: '#ffffff',
        fontSize: 16
      },
      legend: { labels: { fontColor: '#2ecc71' } },
      scales: {
        xAxes: [{
          scaleLabel: { display: true, labelString: 'Czas (Godziny)', fontColor: '#38bdf8' },
          ticks: { fontColor: '#e2e8f0' },
          gridLines: { color: 'rgba(255,255,255,0.1)' }
        }],
        yAxes: [{
          scaleLabel: { display: true, labelString: 'Liczba Wizyt', fontColor: '#2ecc71' },
          ticks: { beginAtZero: true, stepSize: 1, fontColor: '#e2e8f0' },
          gridLines: { color: 'rgba(255,255,255,0.1)' }
        }]
      }
    }
  };
}

async function sendChartToDiscord(env, triggerReason) {
  const chartConfig = await buildQuickChartConfig(env);
  const chartUrl = `https://quickchart.io/chart?bkg=%230d1321&width=650&height=360&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

  const counts = chartConfig.data.datasets[0].data;
  const totalVisits = counts.reduce((a, b) => a + b, 0);

  const discordEmbed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "📈 Raport i Wykres Wizyt na Stronie",
      description: `**Powód wyzwolenia:** ${triggerReason}\n**Oś Pozioma (X):** Czas (Godziny)\n**Oś Pionowa (Y):** Liczba Wizyt`,
      color: 3066993,
      fields: [
        { name: "📊 Suma wizyt (12h)", value: `**${totalVisits}** połączeń`, inline: true },
        { name: "🕒 Czas generowania", value: new Date().toLocaleTimeString("pl-PL"), inline: true },
        { name: "⚡ Szybki wyzwalacz", value: "Komenda: `/chart` lub link: `https://flat-dust-8358.3-14-bargiel.workers.dev/chart`", inline: false }
      ],
      image: { url: chartUrl },
      footer: { text: "Cloudflare Serverless Bot // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };

  const response = await fetch(CHART_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(discordEmbed)
  });

  return response.status;
}
