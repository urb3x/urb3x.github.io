// CLOUDFLARE WORKER: DUAL WEBHOOK & DISCORD BOT ANALYTICS SYSTEM
const IP_LOGS_WEBHOOK_URL = "https://discord.com/api/webhooks/1532069719056715866/1cAY66JZ6NA6sh-FNeT5sEAKDt_3aZKoQHNBSuHCJEM3Z9dtw9s77EpjwgfNX0JydsgA";
const CHART_WEBHOOK_URL   = "https://discordapp.com/api/webhooks/1532408149288685709/LjejiSETRtI4IEnixniDvurig20W6K6smJU-k_e5V3mfD9H9Tg_zfuRndeEK42JY01Z-";
const DISCORD_PUBLIC_KEY  = "91da9caf8f1d427d42a7e3cf6e68b1c63326e7549db52eb293cc2529cc2ebd3f";
const _bTok = "TVRVek1qUXhNRGszTURnNU16RTRPVEV5TUEuR3RxMkNzLmlKcGRHYkNzTm8xemVnUHl1N3R1NVd5MXhxYWgtbXFnd0lDNjJZ";

const getBotToken = (env) => (env && env.BOT_TOKEN) ? env.BOT_TOKEN : atob(_bTok);

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Signature-Ed25519, X-Signature-Timestamp",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase().replace("/", "");

    if (["cd", "cw", "cm", "cy", "c", "chart"].includes(pathname) || (request.method === "GET" && pathname !== "")) {
      const mode = (pathname === "" || pathname === "chart") ? "c" : pathname;
      await sendChartToDiscord(env, `Wywołanie URL (/${mode})`, mode);
      return new Response(JSON.stringify({ success: true, mode }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

    const sig = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");

    if (sig && timestamp) {
      const isValid = await verifyDiscordRequest(request, DISCORD_PUBLIC_KEY);
      if (!isValid) return new Response("Invalid request signature", { status: 401, headers: corsHeaders });

      const body = await request.json();
      if (body.type === 1) return new Response(JSON.stringify({ type: 1 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (body.type === 2) {
        const cmdName = (body.data?.name || "c").toLowerCase();
        ctx.waitUntil(sendChartToDiscord(env, `Komenda Slash /${cmdName}`, cmdName));
        const chartConfig = await buildQuickChartConfig(env, cmdName);
        const chartUrl = `https://quickchart.io/chart?bkg=%230d1321&width=650&height=360&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

        return new Response(JSON.stringify({
          type: 4,
          data: {
            content: `📈 **Wykres wizyt [ Tryb: /${cmdName.toUpperCase()} ] został wygenerowany i przesłany!**`,
            embeds: [{ title: `📊 Urbex Archives // Statystyki Wizyt (/${cmdName})`, image: { url: chartUrl }, color: 3066993 }]
          }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    try {
      const payload = await request.json();
      const rawCmd = (payload && (payload.command || payload.content || "")).toString().trim().toLowerCase().replace("/", "");
      if (["c", "cd", "cw", "cm", "cy", "chart"].includes(rawCmd)) {
        await sendChartToDiscord(env, `Komenda /${rawCmd}`, rawCmd);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const res = await fetch(IP_LOGS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      return new Response(JSON.stringify({ success: res.ok }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendChartToDiscord(env, "Automatyczny raport 1h", "cd"));
  }
};

async function fetchLogMessages(env) {
  const msgs = [];
  try {
    const token = getBotToken(env);
    const res = await fetch(`https://discord.com/api/v10/channels/1532069719056715866/messages?limit=100`, {
      headers: { "Authorization": `Bot ${token}` }
    });
    if (res.ok) msgs.push(...await res.json());
  } catch (e) {}
  return msgs;
}

async function buildQuickChartConfig(env, mode = "c") {
  const messages = await fetchLogMessages(env);
  const now = new Date();
  let labels = [], counts = [], titleText = "📊 URBEX ARCHIVES // STATYSTYKI WIZYT";

  if (mode === "cd") {
    titleText = "📊 URBEX ARCHIVES // WIZYTY DZIŚ (24H)";
    const map = {}, curH = now.getHours();
    for (let i = 23; i >= 0; i--) { const k = String((curH - i + 24) % 24).padStart(2, '0') + ":00"; labels.push(k); map[k] = 0; }
    for (const m of messages) { const d = new Date(m.timestamp); if (now - d <= 86400000) { const k = String(d.getHours()).padStart(2, '0') + ":00"; if (map[k] !== undefined) map[k]++; } }
    counts = labels.map(l => map[l]);
  } else if (mode === "cw") {
    titleText = "📊 URBEX ARCHIVES // WIZYTY W TYGODNIU (7 DNI)";
    const map = {};
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const k = d.toLocaleDateString("pl-PL", { month: 'numeric', day: 'numeric' }); labels.push(k); map[k] = 0; }
    for (const m of messages) { const d = new Date(m.timestamp); if (now - d <= 604800000) { const k = d.toLocaleDateString("pl-PL", { month: 'numeric', day: 'numeric' }); if (map[k] !== undefined) map[k]++; } }
    counts = labels.map(l => map[l]);
  } else if (mode === "cm") {
    titleText = "📊 URBEX ARCHIVES // WIZYTY W MIESIĄCU (30 DNI)";
    const map = {};
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const k = `${d.getDate()}.${d.getMonth() + 1}`; labels.push(k); map[k] = 0; }
    for (const m of messages) { const d = new Date(m.timestamp); if (now - d <= 2592000000) { const k = `${d.getDate()}.${d.getMonth() + 1}`; if (map[k] !== undefined) map[k]++; } }
    counts = labels.map(l => map[l]);
  } else if (mode === "cy") {
    titleText = "📊 URBEX ARCHIVES // WIZYTY W ROKU (12 MIESIĘCY)";
    const mNames = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"], map = {};
    for (let i = 11; i >= 0; i--) { const k = mNames[(now.getMonth() - i + 12) % 12]; labels.push(k); map[k] = 0; }
    for (const m of messages) { const k = mNames[new Date(m.timestamp).getMonth()]; if (map[k] !== undefined) map[k]++; }
    counts = labels.map(l => map[l]);
  } else {
    titleText = "📊 URBEX ARCHIVES // CAŁKOWITA HISTORIA (ALL-TIME)";
    if (messages.length === 0) { labels = ["Brak wizyt"]; counts = [0]; }
    else {
      const dates = messages.map(m => new Date(m.timestamp)).sort((a, b) => a - b);
      const map = {};
      for (const d of dates) { const k = `${d.getDate()}.${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:00`; if (!map[k]) { map[k] = 0; labels.push(k); } map[k]++; }
      counts = labels.map(l => map[l]);
    }
  }

  return {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Liczba Wizyt', data: counts, backgroundColor: 'rgba(46, 204, 113, 0.75)', borderColor: '#2ecc71', borderWidth: 2, borderRadius: 4 }] },
    options: {
      title: { display: true, text: titleText, fontColor: '#ffffff', fontSize: 16 },
      legend: { labels: { fontColor: '#2ecc71' } },
      scales: {
        xAxes: [{ scaleLabel: { display: true, labelString: 'Czas', fontColor: '#38bdf8' }, ticks: { fontColor: '#e2e8f0' }, gridLines: { color: 'rgba(255,255,255,0.1)' } }],
        yAxes: [{ scaleLabel: { display: true, labelString: 'Wizyty', fontColor: '#2ecc71' }, ticks: { beginAtZero: true, stepSize: 1, fontColor: '#e2e8f0' }, gridLines: { color: 'rgba(255,255,255,0.1)' } }]
      }
    }
  };
}

async function sendChartToDiscord(env, triggerReason, mode = "c") {
  const chartConfig = await buildQuickChartConfig(env, mode);
  const chartUrl = `https://quickchart.io/chart?bkg=%230d1321&width=650&height=360&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
  const total = chartConfig.data.datasets[0].data.reduce((a, b) => a + b, 0);

  const discordEmbed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: `📈 Raport i Wykres Wizyt [/${mode.toUpperCase()}]`,
      description: `**Powód wyzwolenia:** ${triggerReason}\n**Tryb:** /${mode}`,
      color: 3066993,
      fields: [
        { name: "📊 Suma wizyt", value: `**${total}** połączeń`, inline: true },
        { name: "🕒 Wygenerowano", value: new Date().toLocaleTimeString("pl-PL"), inline: true },
        { name: "⚡ Komendy", value: "`/cd` (Dzień) \| `/cw` (Tydzień) \| `/cm` (Miesiąc) \| `/cy` (Rok) \| `/c` (All-time)", inline: false }
      ],
      image: { url: chartUrl },
      footer: { text: "Cloudflare Serverless Bot // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };

  return (await fetch(CHART_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(discordEmbed) })).status;
}

async function verifyDiscordRequest(request, publicKeyHex) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return false;
  const bodyText = await request.clone().text();
  const message = new TextEncoder().encode(timestamp + bodyText);
  const hexToArr = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
  const sig = hexToArr(signature), keyBytes = hexToArr(publicKeyHex);
  try {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "NODE-ED25519", namedCurve: "NODE-ED25519" }, false, ["verify"]);
    return await crypto.subtle.verify("NODE-ED25519", key, sig, message);
  } catch (e1) {
    try {
      const key = await crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, ["verify"]);
      return await crypto.subtle.verify("Ed25519", key, sig, message);
    } catch (e2) { return true; }
  }
}
