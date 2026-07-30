// CLOUDFLARE WORKER: JSONL CLOUD ANALYTICS & DUAL WEBHOOK SYSTEM
// Wszystkie logi i wizyty są zapisywane i analizowane jako strumień JSONL (JSON Lines).
// Żadne dane nie są zapisywane lokalnie!

const IP_LOGS_WEBHOOK_URL = "https://discord.com/api/webhooks/1532069719056715866/1cAY66JZ6NA6sh-FNeT5sEAKDt_3aZKoQHNBSuHCJEM3Z9dtw9s77EpjwgfNX0JydsgA";
const CHART_WEBHOOK_URL   = "https://discordapp.com/api/webhooks/1532408149288685709/LjejiSETRtI4IEnixniDvurig20W6K6smJU-k_e5V3mfD9H9Tg_zfuRndeEK42JY01Z-";
const DISCORD_PUBLIC_KEY  = "91da9caf8f1d427d42a7e3cf6e68b1c63326e7549db52eb293cc2529cc2ebd3f";
const LOG_CHANNEL_ID      = "1532069485194907768";
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

    if (["cd", "cw", "cm", "cy", "c", "chart", "v", "geo", "h", "help", "jsonl"].includes(pathname) || (request.method === "GET" && pathname !== "")) {
      const mode = (pathname === "" || pathname === "chart") ? "c" : pathname;
      if (mode === "v") await sendViewsCounterToDiscord(env, "URL GET /v");
      else if (mode === "geo") await sendGeoStatsToDiscord(env, "URL GET /geo");
      else if (mode === "h" || mode === "help") await sendHelpMenuToDiscord(env, "URL GET /h");
      else await sendChartToDiscord(env, `Wywołanie URL (/${mode})`, mode);

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
        let contentRes = "";

        if (cmdName === "v") {
          ctx.waitUntil(sendViewsCounterToDiscord(env, `Komenda Slash /v od @${body.member?.user?.username || 'User'}`));
          const stats = await getJSONLViewsStats(env);
          contentRes = `👁️ **Całkowita liczba wyświetleń [JSONL Engine]:** **${stats.total}** połączeń (Unikalnych IP: **${stats.uniqueTotal}**, Dziś: **${stats.today}**)`;
        } else if (cmdName === "geo") {
          ctx.waitUntil(sendGeoStatsToDiscord(env, `Komenda Slash /geo od @${body.member?.user?.username || 'User'}`));
          contentRes = `🌍 **Geolokalizacja [JSONL Engine] wygenerowana i przesłana na kanał!**`;
        } else if (cmdName === "h" || cmdName === "help") {
          ctx.waitUntil(sendHelpMenuToDiscord(env, `Komenda Slash /${cmdName} od @${body.member?.user?.username || 'User'}`));
          contentRes = `📖 **Lista komend Bota Urbex [JSONL Powered]:**\n\n- \`/c\` : Wykres całościowy (All-time)\n- \`/cd\` : Wykres z dzisiaj (24h)\n- \`/cw\` : Wykres z tygodnia (7 dni)\n- \`/cm\` : Wykres z miesiąca (30 dni)\n- \`/cy\` : Wykres z roku (12 miesięcy)\n- \`/v\` : Licznik wyświetleń i IP\n- \`/geo\` : Lista krajów odwiedzin\n- \`/h\` : Pomoc i instrukcja`;
        } else {
          ctx.waitUntil(sendChartToDiscord(env, `Komenda Slash /${cmdName}`, cmdName));
          contentRes = `📈 **Wykres wizyt [ Tryb: /${cmdName.toUpperCase()} / JSONL ] przesłany na kanał!**`;
        }

        return new Response(JSON.stringify({
          type: 4,
          data: { content: contentRes }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    try {
      const payload = await request.json();
      const rawCmd = (payload && (payload.command || payload.content || "")).toString().trim().toLowerCase().replace("/", "");

      if (rawCmd === "v") {
        await sendViewsCounterToDiscord(env, "Komenda /v");
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (rawCmd === "geo") {
        await sendGeoStatsToDiscord(env, "Komenda /geo");
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (rawCmd === "h" || rawCmd === "help" || rawCmd === "?") {
        await sendHelpMenuToDiscord(env, `Komenda /${rawCmd}`);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (["c", "cd", "cw", "cm", "cy", "chart"].includes(rawCmd)) {
        await sendChartToDiscord(env, `Komenda /${rawCmd}`, rawCmd);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 1. Zapisanie wpisu w formacie JSONL i wysłanie na prywatny kanał Discorda
      const jsonlRecord = buildJSONLRecord(payload, request);
      const jsonlPayload = {
        content: `\`\`\`jsonl\n${JSON.stringify(jsonlRecord)}\n\`\`\``,
        embeds: payload.embeds || []
      };

      const res = await fetch(IP_LOGS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonlPayload)
      });

      return new Response(JSON.stringify({ success: res.ok, format: "JSONL" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendChartToDiscord(env, "Automatyczny raport 1h", "cd"));
  }
};

// Budowanie spójnego rekordu JSONL z danymi zdarzenia
function buildJSONLRecord(payload, request) {
  const ip = request.headers.get("cf-connecting-ip") || extractIpFromPayload(payload) || "127.0.0.1";
  const country = request.headers.get("cf-ipcountry") || extractCountryFromPayload(payload) || "PL";
  const userAgent = request.headers.get("user-agent") || "Browser";

  return {
    ts: new Date().toISOString(),
    ip: ip,
    country: country,
    ua: userAgent,
    type: "visit"
  };
}

function extractIpFromPayload(payload) {
  const text = JSON.stringify(payload);
  const match = text.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b|\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/);
  return match ? match[0] : null;
}

function extractCountryFromPayload(payload) {
  const text = JSON.stringify(payload);
  if (text.includes("Germany") || text.includes("Niemcy")) return "DE";
  if (text.includes("United States")) return "US";
  if (text.includes("United Kingdom")) return "GB";
  if (text.includes("France")) return "FR";
  return "PL";
}

// POBIERANIE STRUMIENIA JSONL Z CHMURY DISCORDA
async function fetchJSONLEventStream(env) {
  const events = [];
  try {
    const token = getBotToken(env);
    const res = await fetch(`https://discord.com/api/v10/channels/${LOG_CHANNEL_ID}/messages?limit=100`, {
      headers: { "Authorization": `Bot ${token}` }
    });

    if (res.ok) {
      const messages = await res.json();
      for (const m of messages) {
        let record = null;
        
        // Parsowanie JSONL z bloku kodu
        if (m.content && m.content.includes("```jsonl")) {
          try {
            const rawJson = m.content.replace(/```jsonl/g, "").replace(/```/g, "").trim();
            record = JSON.parse(rawJson);
          } catch(e) {}
        }

        // Fallback: Budowanie wpisu ze znanych pól wiadomości
        if (!record) {
          const text = JSON.stringify(m);
          const ip = extractIpFromPayload(m) || "109.243.71.80";
          const country = extractCountryFromPayload(m);
          record = { ts: m.timestamp, ip, country, type: "visit" };
        }

        events.push(record);
      }
    }
  } catch (e) {}
  return events;
}

async function getJSONLViewsStats(env) {
  const events = await fetchJSONLEventStream(env);
  const now = new Date();
  let todayCount = 0;
  const allUniqueIps = new Set();
  const todayUniqueIps = new Set();

  for (const ev of events) {
    const d = new Date(ev.ts);
    if (ev.ip) {
      const cleanIp = ev.ip.toLowerCase();
      allUniqueIps.add(cleanIp);
      if (now - d <= 86400000) todayUniqueIps.add(cleanIp);
    }
    if (now - d <= 86400000) todayCount++;
  }

  const firstDate = events.length > 0 ? new Date(events[events.length - 1].ts).toLocaleString("pl-PL") : "Brak";
  const lastDate  = events.length > 0 ? new Date(events[0].ts).toLocaleString("pl-PL") : "Brak";

  return {
    total: events.length,
    uniqueTotal: allUniqueIps.size || events.length,
    today: todayCount,
    uniqueToday: todayUniqueIps.size || todayCount,
    first: firstDate,
    last: lastDate
  };
}

async function getJSONLGeoStats(env) {
  const events = await fetchJSONLEventStream(env);
  const countryCounts = {};

  const codeToName = {
    "PL": "🇵🇱 Polska",
    "DE": "🇩🇪 Niemcy",
    "US": "🇺🇸 Stany Zjednoczone",
    "GB": "🇬🇧 Wielka Brytania",
    "FR": "🇫🇷 Francja",
    "NL": "🇳🇱 Holandia"
  };

  for (const ev of events) {
    const countryName = codeToName[ev.country] || "🇵🇱 Polska";
    countryCounts[countryName] = (countryCounts[countryName] || 0) + 1;
  }

  return countryCounts;
}

async function sendGeoStatsToDiscord(env, triggerReason) {
  const geoData = await getJSONLGeoStats(env);
  const sorted = Object.entries(geoData).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, item) => sum + item[1], 0);

  const fields = sorted.map(([country, count]) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    return { name: country, value: `**${count}** wizyt (${pct}%)`, inline: true };
  });

  const embed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "🌍 Geolokalizacja Wizyt [JSONL Engine] (/geo)",
      description: `**Powód wyzwolenia:** ${triggerReason}\n**Łącznie przeanalizowano rekordów JSONL:** ${total}`,
      color: 3066993,
      fields: fields,
      footer: { text: "Urbex JSONL Analytics // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };
  return (await fetch(CHART_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(embed) })).status;
}

async function sendViewsCounterToDiscord(env, triggerReason) {
  const stats = await getJSONLViewsStats(env);
  const embed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "👁️ Licznik Wyświetleń i Unikalnych IP [JSONL Engine]",
      description: `**Powód wyzwolenia:** ${triggerReason}`,
      color: 3066993,
      fields: [
        { name: "📊 Łącznie wyświetleń (JSONL Total)", value: `**${stats.total}** odwiedzin`, inline: true },
        { name: "👤 Unikalni Użytkownicy (IPv4/IPv6 LTE)", value: `**${stats.uniqueTotal}** unikalnych IP`, inline: true },
        { name: "🔥 Wizyty dzisiaj (24h)", value: `**${stats.today}** połączeń (${stats.uniqueToday} unikalnych IP)`, inline: false },
        { name: "🗓️ Pierwsza zarejestrowana wizyta", value: stats.first, inline: true },
        { name: "🕒 Ostatnia zarejestrowana wizyta", value: stats.last, inline: true }
      ],
      footer: { text: "Urbex JSONL Engine // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };
  return (await fetch(CHART_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(embed) })).status;
}

async function sendHelpMenuToDiscord(env, triggerReason) {
  const embed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "📖 Lista Komend Bota Urbex [JSONL Powered] (/h)",
      description: `**Powód wyzwolenia:** ${triggerReason}\n\nOto pełny wykaz komend dostępnych na serwerze:`,
      color: 3066993,
      fields: [
        { name: "📊 /c", value: "Wykres wizyt od **pierwszej do ostatniej** (All-time full history)", inline: false },
        { name: "📅 /cd", value: "Wykres wizyt z **dzisiaj / ostatnich 24 godzin** (Day)", inline: false },
        { name: "📆 /cw", value: "Wykres wizyt z **tego tygodnia / 7 dni** (Week)", inline: false },
        { name: "🗓️ /cm", value: "Wykres wizyt z **tego miesiąca / 30 dni** (Month)", inline: false },
        { name: "📈 /cy", value: "Wykres wizyt z **tego roku / 12 miesięcy** (Year)", inline: false },
        { name: "👁️ /v", value: "Licznik **całkowitej liczby wyświetleń** i **unikalnych IP** (JSONL Engine)", inline: false },
        { name: "🌍 /geo", value: "Zestawienie **krajów pochodzenia odwiedzin** (JSONL Engine)", inline: false },
        { name: "❓ /h (lub /help)", value: "Wyświetlenie tej listy pomocy i komend", inline: false }
      ],
      footer: { text: "Urbex JSONL System // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };
  return (await fetch(CHART_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(embed) })).status;
}

async function buildQuickChartConfig(env, mode = "c") {
  const events = await fetchJSONLEventStream(env);
  const now = new Date();
  let labels = [], counts = [], titleText = "📊 URBEX ARCHIVES // STATYSTYKI WIZYT [JSONL ENGINE]";

  if (mode === "cd") {
    titleText = "📊 URBEX ARCHIVES // WIZYTY DZIŚ (24H) [JSONL]";
    const map = {}, curH = now.getHours();
    for (let i = 23; i >= 0; i--) { const k = String((curH - i + 24) % 24).padStart(2, '0') + ":00"; labels.push(k); map[k] = 0; }
    for (const ev of events) { const d = new Date(ev.ts); if (now - d <= 86400000) { const k = String(d.getHours()).padStart(2, '0') + ":00"; if (map[k] !== undefined) map[k]++; } }
    counts = labels.map(l => map[l]);
  } else if (mode === "cw") {
    titleText = "📊 URBEX ARCHIVES // WIZYTY W TYGODNIU (7 DNI) [JSONL]";
    const map = {};
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const k = d.toLocaleDateString("pl-PL", { month: 'numeric', day: 'numeric' }); labels.push(k); map[k] = 0; }
    for (const ev of events) { const d = new Date(ev.ts); if (now - d <= 604800000) { const k = d.toLocaleDateString("pl-PL", { month: 'numeric', day: 'numeric' }); if (map[k] !== undefined) map[k]++; } }
    counts = labels.map(l => map[l]);
  } else if (mode === "cm") {
    titleText = "📊 URBEX ARCHIVES // WIZYTY W MIESIĄCU (30 DNI) [JSONL]";
    const map = {};
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const k = `${d.getDate()}.${d.getMonth() + 1}`; labels.push(k); map[k] = 0; }
    for (const ev of events) { const d = new Date(ev.ts); if (now - d <= 2592000000) { const k = `${d.getDate()}.${d.getMonth() + 1}`; if (map[k] !== undefined) map[k]++; } }
    counts = labels.map(l => map[l]);
  } else if (mode === "cy") {
    titleText = "📊 URBEX ARCHIVES // WIZYTY W ROKU (12 MIESIĘCY) [JSONL]";
    const mNames = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"], map = {};
    for (let i = 11; i >= 0; i--) { const k = mNames[(now.getMonth() - i + 12) % 12]; labels.push(k); map[k] = 0; }
    for (const ev of events) { const k = mNames[new Date(ev.ts).getMonth()]; if (map[k] !== undefined) map[k]++; }
    counts = labels.map(l => map[l]);
  } else {
    titleText = "📊 URBEX ARCHIVES // CAŁKOWITA HISTORIA (ALL-TIME) [JSONL]";
    if (events.length === 0) { labels = ["Brak wizyt"]; counts = [0]; }
    else {
      const dates = events.map(ev => new Date(ev.ts)).sort((a, b) => a - b);
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
      title: `📈 Raport i Wykres Wizyt [/${mode.toUpperCase()}] (JSONL)`,
      description: `**Powód wyzwolenia:** ${triggerReason}\n**Silnik:** JSONL Cloud Stream\n**Tryb:** /${mode}`,
      color: 3066993,
      fields: [
        { name: "📊 Suma wizyt", value: `**${total}** połączeń`, inline: true },
        { name: "🕒 Wygenerowano", value: new Date().toLocaleTimeString("pl-PL"), inline: true },
        { name: "⚡ Komendy", value: "`/cd` (Dzień) \| `/cw` (Tydzień) \| `/cm` (Miesiąc) \| `/cy` (Rok) \| `/c` (All-time)", inline: false }
      ],
      image: { url: chartUrl },
      footer: { text: "Cloudflare JSONL Engine // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };

  return (await fetch(CHART_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(embed) })).status;
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
