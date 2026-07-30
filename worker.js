// CLOUDFLARE WORKER: DUAL WEBHOOK & DISCORD BOT ANALYTICS SYSTEM
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

    if (["cd", "cw", "cm", "cy", "c", "chart", "v", "geo", "h", "help"].includes(pathname) || (request.method === "GET" && pathname !== "")) {
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
          const stats = await getViewsStats(env);
          contentRes = `👁️ **Całkowita liczba wyświetleń:** **${stats.total}** połączeń (Unikalnych IP: **${stats.uniqueTotal}**, Dziś: **${stats.today}**)`;
        } else if (cmdName === "geo") {
          ctx.waitUntil(sendGeoStatsToDiscord(env, `Komenda Slash /geo od @${body.member?.user?.username || 'User'}`));
          contentRes = `🌍 **Geolokalizacja odwiedzin wygenerowana i przesłana na kanał!**`;
        } else if (cmdName === "h" || cmdName === "help") {
          ctx.waitUntil(sendHelpMenuToDiscord(env, `Komenda Slash /${cmdName} od @${body.member?.user?.username || 'User'}`));
          contentRes = `📖 **Lista komend Bota:**\n\n- \`/c\` : Wykres całościowy (All-time)\n- \`/cd\` : Wykres z dzisiaj (24h)\n- \`/cw\` : Wykres z tygodnia (7 dni)\n- \`/cm\` : Wykres z miesiąca (30 dni)\n- \`/cy\` : Wykres z roku (12 miesięcy)\n- \`/v\` : Licznik wyświetleń i IP\n- \`/geo\` : Lista krajów odwiedzin\n- \`/h\` : Pomoc i instrukcja`;
        } else {
          ctx.waitUntil(sendChartToDiscord(env, `Komenda Slash /${cmdName}`, cmdName));
          contentRes = `📈 **Wykres wizyt [ Tryb: /${cmdName.toUpperCase()} ] został przesłany na kanał!**`;
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
    const res = await fetch(`https://discord.com/api/v10/channels/${LOG_CHANNEL_ID}/messages?limit=100`, {
      headers: { "Authorization": `Bot ${token}` }
    });
    if (res.ok) msgs.push(...await res.json());
  } catch (e) {}
  return msgs;
}

async function getViewsStats(env) {
  const messages = await fetchLogMessages(env);
  const now = new Date();
  let todayCount = 0;
  const allUniqueIps = new Set();
  const todayUniqueIps = new Set();
  const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b|\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g;

  for (const m of messages) {
    const d = new Date(m.timestamp);
    const text = JSON.stringify(m);
    const matches = text.match(ipRegex);

    if (matches) {
      matches.forEach(ip => {
        const cleanIp = ip.toLowerCase();
        allUniqueIps.add(cleanIp);
        if (now - d <= 86400000) todayUniqueIps.add(cleanIp);
      });
    }

    if (now - d <= 86400000) todayCount++;
  }

  const firstDate = messages.length > 0 ? new Date(messages[messages.length - 1].timestamp).toLocaleString("pl-PL") : "Brak";
  const lastDate  = messages.length > 0 ? new Date(messages[0].timestamp).toLocaleString("pl-PL") : "Brak";

  return {
    total: messages.length,
    uniqueTotal: allUniqueIps.size || messages.length,
    today: todayCount,
    uniqueToday: todayUniqueIps.size || todayCount,
    first: firstDate,
    last: lastDate
  };
}

async function getGeoStats(env) {
  const messages = await fetchLogMessages(env);
  const countryCounts = {};

  for (const m of messages) {
    const text = JSON.stringify(m);
    let country = "🇵🇱 Polska"; // Domyślnie Polska dla wykrytych połączeń PL / Voivodeship

    if (text.includes("Germany") || text.includes("Niemcy") || text.includes('"DE"')) country = "🇩🇪 Niemcy";
    else if (text.includes("United States") || text.includes("Stany Zjednoczone") || text.includes('"US"')) country = "🇺🇸 Stany Zjednoczone";
    else if (text.includes("United Kingdom") || text.includes("Wielka Brytania") || text.includes('"GB"')) country = "🇬🇧 Wielka Brytania";
    else if (text.includes("France") || text.includes("Francja") || text.includes('"FR"')) country = "🇫🇷 Francja";
    else if (text.includes("Netherlands") || text.includes("Holandia") || text.includes('"NL"')) country = "🇳🇱 Holandia";
    else if (text.includes("Cloudflare") || text.includes("Private Relay")) country = "🇵🇱 Polska (Apple Private Relay)";

    countryCounts[country] = (countryCounts[country] || 0) + 1;
  }

  return countryCounts;
}

async function sendGeoStatsToDiscord(env, triggerReason) {
  const geoData = await getGeoStats(env);
  const sorted = Object.entries(geoData).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, item) => sum + item[1], 0);

  const fields = sorted.map(([country, count]) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    return { name: country, value: `**${count}** wizyt (${pct}%)`, inline: true };
  });

  const embed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "🌍 Geolokalizacja Odwiedzin na Stronie (/geo)",
      description: `**Powód wyzwolenia:** ${triggerReason}\n**Łącznie przeanalizowano:** ${total} wizyt`,
      color: 3066993,
      fields: fields,
      footer: { text: "Urbex Geo System // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };
  return (await fetch(CHART_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(embed) })).status;
}

async function sendViewsCounterToDiscord(env, triggerReason) {
  const stats = await getViewsStats(env);
  const embed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "👁️ Licznik Wyświetleń i Unikalnych Użytkowników (IPv4 + IPv6 LTE)",
      description: `**Powód wyzwolenia:** ${triggerReason}`,
      color: 3066993,
      fields: [
        { name: "📊 Łącznie wyświetleń (Views)", value: `**${stats.total}** odwiedzin`, inline: true },
        { name: "👤 Unikalni Użytkownicy (IPv4/IPv6 LTE)", value: `**${stats.uniqueTotal}** unikalnych IP`, inline: true },
        { name: "🔥 Wizyty dzisiaj (24h)", value: `**${stats.today}** połączeń (${stats.uniqueToday} unikalnych IP)`, inline: false },
        { name: "🗓️ Pierwsza zarejestrowana wizyta", value: stats.first, inline: true },
        { name: "🕒 Ostatnia zarejestrowana wizyta", value: stats.last, inline: true }
      ],
      footer: { text: "Urbex Counter Bot // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };
  return (await fetch(CHART_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(embed) })).status;
}

async function sendHelpMenuToDiscord(env, triggerReason) {
  const embed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: "📖 Lista Komend Bota Urbex (/h)",
      description: `**Powód wyzwolenia:** ${triggerReason}\n\nOto pełny wykaz komend dostępnych na serwerze:`,
      color: 3066993,
      fields: [
        { name: "📊 /c", value: "Wykres wizyt od **pierwszej do ostatniej** (All-time full history)", inline: false },
        { name: "📅 /cd", value: "Wykres wizyt z **dzisiaj / ostatnich 24 godzin** (Day)", inline: false },
        { name: "📆 /cw", value: "Wykres wizyt z **tego tygodnia / 7 dni** (Week)", inline: false },
        { name: "🗓️ /cm", value: "Wykres wizyt z **tego miesiąca / 30 dni** (Month)", inline: false },
        { name: "📈 /cy", value: "Wykres wizyt z **tego roku / 12 miesięcy** (Year)", inline: false },
        { name: "👁️ /v", value: "Licznik **całkowitej liczby wyświetleń** i **unikalnych IP (IPv4 + IPv6 LTE)**", inline: false },
        { name: "🌍 /geo", value: "Zestawienie **krajów pochodzenia odwiedzin** (Geolokalizacja)", inline: false },
        { name: "❓ /h (lub /help)", value: "Wyświetlenie tej listy pomocy i komend", inline: false }
      ],
      footer: { text: "Urbex Help System // urb3x.github.io" },
      timestamp: new Date().toISOString()
    }]
  };
  return (await fetch(CHART_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(embed) })).status;
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
