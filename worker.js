// ============================================================================
// CLOUDFLARE WORKER PROXY & URBEX ANALYTICS CHART SYSTEM
// Webhook: https://discordapp.com/api/webhooks/1532408149288685709/...
// Generuje wykres wizyt (Poziom = Czas, Pion = Liczba Wizyt)
// Wysyła powiadomienia 24/7, wyzwalacz co 1h (Cron Trigger) lub komendą :chart
// ============================================================================

const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1532408149288685709/LjejiSETRtI4IEnixniDvurig20W6K6smJU-k_e5V3mfD9H9Tg_zfuRndeEK42JY01Z-";

// Pamięć in-memory dla godzinowych wizyt (24-godzinny bufor)
let globalVisitCounts = {};

export default {
  // 1. OBSŁUGA ZAPYTAŃ ZE STRONY ORAZ KOMENDY :chart
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

    // Wyzwolenie ręczne generowania wykresu przez URL /chart lub GET /chart
    if (url.pathname === "/chart" || request.method === "GET") {
      const chartRes = await sendChartToDiscord(env, "Wywołanie ręczne (URL / :chart)");
      return new Response(JSON.stringify({ success: true, status: "Chart sent to Discord", res: chartRes }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const payload = await request.json();

      // Wykrycie komendy :chart przesłanej w ładunku
      if (payload && (payload.command === ":chart" || payload.content === ":chart")) {
        await sendChartToDiscord(env, "Komenda :chart");
        return new Response(JSON.stringify({ success: true, message: "Chart generated and sent to Discord" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 1. Zapisanie wizyty do statystyk (Zliczanie wizyt w godzinowym buforze)
      await registerVisit(env);

      // 2. Przesłanie binarnego/standardowego logu połączenia na Discord
      const res = await fetch(DISCORD_WEBHOOK_URL, {
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

  // 2. AUTOMATYCZNY WYZWOLACZ CO 1 GODZINĘ (Cloudflare Cron Trigger "0 * * * *")
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendChartToDiscord(env, "Automatyczny raport co 1h (Cron)"));
  }
};

// Funkcja rejestrująca wizytę w bieżącym przedziale godzinowym
async function registerVisit(env) {
  const now = new Date();
  // Format godziny: "HH:00"
  const hourKey = String(now.getHours()).padStart(2, '0') + ":00";

  if (env && env.ANALYTICS_KV) {
    try {
      let data = await env.ANALYTICS_KV.get("hourly_visits", { type: "json" }) || {};
      data[hourKey] = (data[hourKey] || 0) + 1;
      await env.ANALYTICS_KV.put("hourly_visits", JSON.stringify(data));
      return;
    } catch (e) {
      console.error("KV storage error:", e);
    }
  }

  // Fallback in-memory
  globalVisitCounts[hourKey] = (globalVisitCounts[hourKey] || 0) + 1;
}

// Pobranie danych o wizytach z KV lub pamięci tymczasowej
async function getVisitData(env) {
  if (env && env.ANALYTICS_KV) {
    try {
      const data = await env.ANALYTICS_KV.get("hourly_visits", { type: "json" });
      if (data) return data;
    } catch (e) {}
  }
  return globalVisitCounts;
}

// Generowanie wykresu QuickChart i wysłanie go na Discord
async function sendChartToDiscord(env, triggerReason) {
  const visitData = await getVisitData(env);

  // Przygotowanie 12 ostatnich godzin (Czas - poziomo)
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

  // Konfiguracja wykresu QuickChart (Typ: Słupkowy, X = Czas, Y = Wizyty)
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

  // Przygotowanie wiadomości Embed dla Discorda
  const discordEmbed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "📈 Raport i Wykres Wizyt na Stronie",
      description: `**Powód wyzwolenia:** ${triggerReason}\n**Oś Pozioma (X):** Czas (Godziny)\n**Oś Pionowa (Y):** Liczba Wizyt`,
      color: 3066993,
      fields: [
        { name: "📊 Suma wizyt w oknie (12h)", value: `**${totalVisits}** połączeń`, inline: true },
        { name: "🕒 Ostatnia aktualizacja", value: new Date().toLocaleTimeString("pl-PL"), inline: true },
        { name: "⚡ Komenda ręczna", value: "Napisz `:chart` lub wywołaj URL `/chart`", inline: false }
      ],
      image: { url: chartUrl },
      footer: { text: "Cloudflare Serverless Analytics // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };

  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(discordEmbed)
  });

  return response.status;
}
