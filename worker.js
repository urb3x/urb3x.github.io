// ============================================================================
// CLOUDFLARE WORKER DUAL WEBHOOK SYSTEM:
// 1. IP_LOGS_WEBHOOK_URL -> Wysyła szczegółowe logi IP na Kanał Logów
// 2. CHART_WEBHOOK_URL   -> Wysyła wykresy wizyt (1h / /chart / //c) na Kanał Wykresów
// ============================================================================

const IP_LOGS_WEBHOOK_URL = "https://discord.com/api/webhooks/1532069719056715866/1cAY66JZ6NA6sh-FNeT5sEAKDt_3aZKoQHNBSuHCJEM3Z9dtw9s77EpjwgfNX0JydsgA";
const CHART_WEBHOOK_URL   = "https://discordapp.com/api/webhooks/1532408149288685709/LjejiSETRtI4IEnixniDvurig20W6K6smJU-k_e5V3mfD9H9Tg_zfuRndeEK42JY01Z-";
const _bTok = "TVRVek1qUXhNRGszTURnNU16RTRPVEV5TUEuR3RxMkNzLmlKcGRHYkNzTm8xemVnUHl1N3R1NVd5MXhxYWgtbXFnd0lDNjJZ";

function getBotToken(env) {
  return (env && env.BOT_TOKEN) ? env.BOT_TOKEN : atob(_bTok);
}

let globalVisitCounts = {};

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase();

    // Wyzwolenie ręczne wykresu przez URL /chart lub //c lub /c lub GET /chart
    if (pathname === "/chart" || pathname === "//c" || pathname === "/c" || (request.method === "GET" && pathname !== "/")) {
      const chartRes = await sendChartToDiscord(env, "Wywołanie ręczne (URL /chart lub //c)");
      return new Response(JSON.stringify({ success: true, status: "Chart sent to Chart Channel", res: chartRes }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const payload = await request.json();

      // Wykrycie komendy /chart lub //c przesłanej w ładunku
      const cmd = (payload && (payload.command || payload.content || "")).toString().trim().toLowerCase();
      if (cmd === "/chart" || cmd === "//c" || cmd === ":chart" || cmd === "chart") {
        await sendChartToDiscord(env, `Komenda ${cmd}`);
        return new Response(JSON.stringify({ success: true, message: `Chart generated for ${cmd}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 1. Zapisanie rejestrowanej wizyty w statystykach
      await registerVisit(env);

      // 2. Wysyłanie logu IP na STARY KANAŁ LOGÓW (IP_LOGS_WEBHOOK_URL)
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

async function sendChartToDiscord(env, triggerReason) {
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

  const totalVisits = counts.reduce((a, b) => a + b, 0);

  const chartConfig = {
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

  const chartUrl = `https://quickchart.io/chart?bkg=%230d1321&width=650&height=360&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

  const discordEmbed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "📈 Raport i Wykres Wizyt na Stronie",
      description: `**Powód wyzwolenia:** ${triggerReason}\n**Oś Pozioma (X):** Czas (Godziny)\n**Oś Pionowa (Y):** Liczba Wizyt`,
      color: 3066993,
      fields: [
        { name: "📊 Suma wizyt (12h)", value: `**${totalVisits}** połączeń`, inline: true },
        { name: "🕒 Czas generowania", value: new Date().toLocaleTimeString("pl-PL"), inline: true },
        { name: "⚡ Szybki wyzwalacz", value: "Komendy: `/chart` lub `//c`\nLink: `https://flat-dust-8358.3-14-bargiel.workers.dev/chart`", inline: false }
      ],
      image: { url: chartUrl },
      footer: { text: "Cloudflare Serverless Bot // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };

  // Wysyłanie WYKRESU na NOWY KANAŁ WYKRESÓW (CHART_WEBHOOK_URL)
  const response = await fetch(CHART_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(discordEmbed)
  });

  return response.status;
}
