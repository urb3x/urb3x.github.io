// ============================================================================
// CLOUDFLARE WORKER DUAL WEBHOOK & DISCORD BOT ANALYTICS SYSTEM
// Komendy Slash:
// /cd -> Wykres wizyt z dzisiaj / ostatnich 24 godzin (Day)
// /cw -> Wykres wizyt z tygodnia / ostatnich 7 dni (Week)
// /cm -> Wykres wizyt z miesiąca / ostatnich 30 dni (Month)
// /cy -> Wykres wizyt z roku / 12 miesięcy (Year)
// /c  -> Wykres od pierwszej do ostatniej wizyty (All-time full history)
// ============================================================================

const IP_LOGS_WEBHOOK_URL = "https://discord.com/api/webhooks/1532069719056715866/1cAY66JZ6NA6sh-FNeT5sEAKDt_3aZKoQHNBSuHCJEM3Z9dtw9s77EpjwgfNX0JydsgA";
const CHART_WEBHOOK_URL   = "https://discordapp.com/api/webhooks/1532408149288685709/LjejiSETRtI4IEnixniDvurig20W6K6smJU-k_e5V3mfD9H9Tg_zfuRndeEK42JY01Z-";
const DISCORD_PUBLIC_KEY  = "91da9caf8f1d427d42a7e3cf6e68b1c63326e7549db52eb293cc2529cc2ebd3f";
const _bTok = "TVRVek1qUXhNRGszTURnNU16RTRPVEV5TUEuR3RxMkNzLmlKcGRHYkNzTm8xemVnUHl1N3R1NVd5MXhxYWgtbXFnd0lDNjJZ";

function getBotToken(env) {
  return (env && env.BOT_TOKEN) ? env.BOT_TOKEN : atob(_bTok);
}

let cachedChannelId = null;

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

    // Wyzwolenie ręczne przez URL (np. /cd, /cw, /cm, /cy, /c, /chart)
    if (pathname === "/cd" || pathname === "/cw" || pathname === "/cm" || pathname === "/cy" || pathname === "/c" || pathname === "/chart") {
      const mode = pathname.replace("/", "") || "c";
      const chartRes = await sendChartToDiscord(env, `Wywołanie ręczne z URL (${pathname})`, mode);
      return new Response(JSON.stringify({ success: true, mode: mode, status: "Chart sent to Discord channel", res: chartRes }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    // Obsługa bezpośrednich interakcji Slash Commands od Discorda (/cd, /cw, /cm, /cy, /c)
    const sig = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");

    if (sig && timestamp) {
      const isValid = await verifyDiscordRequest(request, DISCORD_PUBLIC_KEY);
      if (!isValid) {
        return new Response("Invalid request signature", { status: 401, headers: corsHeaders });
      }

      const body = await request.json();

      // PING testowy z Discord Developer Portal
      if (body.type === 1) {
        return new Response(JSON.stringify({ type: 1 }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Wyzwolenie komend Slash (/c, /cd, /cw, /cm, /cy)
      if (body.type === 2) {
        const cmdName = (body.data?.name || "c").toLowerCase();
        ctx.waitUntil(sendChartToDiscord(env, `Komenda Slash /${cmdName} od @${body.member?.user?.username || 'User'}`, cmdName));

        const chartConfig = await buildQuickChartConfig(env, cmdName);
        const chartUrl = `https://quickchart.io/chart?bkg=%230d1321&width=650&height=360&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

        return new Response(JSON.stringify({
          type: 4,
          data: {
            content: `📈 **Wykres wizyt [ Tryb: /${cmdName.toUpperCase()} ] został wygenerowany i przesłany na kanał!**`,
            embeds: [{
              title: `📊 Urbex Archives // Statystyki Wizyt (/${cmdName})`,
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

      // Wykrycie komend przesłanych w ładunku JSON
      const rawCmd = (payload && (payload.command || payload.content || "")).toString().trim().toLowerCase().replace("/", "");
      if (["c", "cd", "cw", "cm", "cy", "chart"].includes(rawCmd)) {
        await sendChartToDiscord(env, `Komenda /${rawCmd}`, rawCmd);
        return new Response(JSON.stringify({ success: true, message: `Chart sent for /${rawCmd}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Rejestrowanie nowej wizyty na PRYWATNYM KANALE LOGÓW
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

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendChartToDiscord(env, "Automatyczny raport co 1h (Cron)", "cd"));
  }
};

async function getLogChannelId() {
  if (cachedChannelId) return cachedChannelId;
  try {
    const res = await fetch(IP_LOGS_WEBHOOK_URL);
    if (res.ok) {
      const data = await res.json();
      if (data && data.channel_id) {
        cachedChannelId = data.channel_id;
        return cachedChannelId;
      }
    }
  } catch (e) {}
  return "1532069719056715866";
}

// Pobranie historii wiadomości wizyt z prywatnego kanału logów
async function fetchAllVisitLogMessages(env) {
  const allMessages = [];
  try {
    const token = getBotToken(env);
    const channelId = await getLogChannelId();

    let lastId = null;
    for (let page = 0; page < 3; page++) { // Pobiera do 300 ostatnich logów
      let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
      if (lastId) url += `&before=${lastId}`;

      const res = await fetch(url, { headers: { "Authorization": `Bot ${token}` } });
      if (!res.ok) break;

      const msgs = await res.json();
      if (!msgs || msgs.length === 0) break;

      allMessages.push(...msgs);
      lastId = msgs[msgs.length - 1].id;
    }
  } catch (e) {
    console.error("Błąd podczas pobierania logów z Discorda:", e);
  }
  return allMessages;
}

// Budowanie danych wykresu w zależności od trybu: cd, cw, cm, cy, c
async function buildQuickChartConfig(env, mode = "c") {
  const messages = await fetchAllVisitLogMessages(env);
  const now = new Date();

  let labels = [];
  let counts = [];
  let titleText = "📊 URBEX ARCHIVES // STATYSTYKI WIZYT";

  if (mode === "cd") {
    // /cd -> DZIEŃ (24h)
    titleText = "📊 URBEX ARCHIVES // WIZYTY DZIŚ (24 GODZINY)";
    const hourlyMap = {};
    const curH = now.getHours();

    for (let i = 23; i >= 0; i--) {
      const h = (curH - i + 24) % 24;
      const key = String(h).padStart(2, '0') + ":00";
      labels.push(key);
      hourlyMap[key] = 0;
    }

    for (const msg of messages) {
      const msgDate = new Date(msg.timestamp);
      if ((now - msgDate) <= 24 * 60 * 60 * 1000) {
        const key = String(msgDate.getHours()).padStart(2, '0') + ":00";
        if (hourlyMap[key] !== undefined) hourlyMap[key]++;
      }
    }
    counts = labels.map(l => hourlyMap[l] || 0);

  } else if (mode === "cw") {
    // /cw -> TYDZIEŃ (Ostatnie 7 DNI)
    titleText = "📊 URBEX ARCHIVES // WIZYTY W TYM TYGODNIU (7 DNI)";
    const dayMap = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("pl-PL", { month: 'numeric', day: 'numeric' });
      labels.push(key);
      dayMap[key] = 0;
    }

    for (const msg of messages) {
      const msgDate = new Date(msg.timestamp);
      if ((now - msgDate) <= 7 * 24 * 60 * 60 * 1000) {
        const key = msgDate.toLocaleDateString("pl-PL", { month: 'numeric', day: 'numeric' });
        if (dayMap[key] !== undefined) dayMap[key]++;
      }
    }
    counts = labels.map(l => dayMap[l] || 0);

  } else if (mode === "cm") {
    // /cm -> MIESIĄC (Ostatnie 30 DNI)
    titleText = "📊 URBEX ARCHIVES // WIZYTY W TYM MIESIĄCU (30 DNI)";
    const dayMap = {};

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getDate()}.${d.getMonth() + 1}`;
      labels.push(key);
      dayMap[key] = 0;
    }

    for (const msg of messages) {
      const msgDate = new Date(msg.timestamp);
      if ((now - msgDate) <= 30 * 24 * 60 * 60 * 1000) {
        const key = `${msgDate.getDate()}.${msgDate.getMonth() + 1}`;
        if (dayMap[key] !== undefined) dayMap[key]++;
      }
    }
    counts = labels.map(l => dayMap[l] || 0);

  } else if (mode === "cy") {
    // /cy -> ROK (12 MIESIĘCY)
    titleText = "📊 URBEX ARCHIVES // WIZYTY W TYM ROKU (12 MIESIĘCY)";
    const monthNames = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];
    const monthMap = {};

    for (let i = 11; i >= 0; i--) {
      const m = (now.getMonth() - i + 12) % 12;
      const key = monthNames[m];
      labels.push(key);
      monthMap[key] = 0;
    }

    for (const msg of messages) {
      const msgDate = new Date(msg.timestamp);
      const key = monthNames[msgDate.getMonth()];
      if (monthMap[key] !== undefined) monthMap[key]++;
    }
    counts = labels.map(l => monthMap[l] || 0);

  } else {
    // /c lub /chart -> PEŁNA HISTORIA (OD PIERWSZEJ DO OSTATNIEJ WIZYTY)
    titleText = "📊 URBEX ARCHIVES // CAŁKOWITA HISTORIA (ALL-TIME)";
    
    if (messages.length === 0) {
      labels = ["Brak wizyt"];
      counts = [0];
    } else {
      const dates = messages.map(m => new Date(m.timestamp)).sort((a, b) => a - b);
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];

      const diffDays = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));

      if (diffDays <= 2) {
        // Zgrupuj według godzin od pierwszej do ostatniej
        const hourlyMap = {};
        for (const msgDate of dates) {
          const key = `${msgDate.getDate()}.${msgDate.getMonth() + 1} ${String(msgDate.getHours()).padStart(2, '0')}:00`;
          if (!hourlyMap[key]) {
            hourlyMap[key] = 0;
            labels.push(key);
          }
          hourlyMap[key]++;
        }
        counts = labels.map(l => hourlyMap[l]);
      } else {
        // Zgrupuj według dni od pierwszej do ostatniej
        const dayMap = {};
        for (const msgDate of dates) {
          const key = `${msgDate.getDate()}.${msgDate.getMonth() + 1}`;
          if (!dayMap[key]) {
            dayMap[key] = 0;
            labels.push(key);
          }
          dayMap[key]++;
        }
        counts = labels.map(l => dayMap[l]);
      }
    }
  }

  return {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Liczba Wizyt',
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
        text: titleText,
        fontColor: '#ffffff',
        fontSize: 16
      },
      legend: { labels: { fontColor: '#2ecc71' } },
      scales: {
        xAxes: [{
          scaleLabel: { display: true, labelString: 'Przedział Czasu', fontColor: '#38bdf8' },
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

async function sendChartToDiscord(env, triggerReason, mode = "c") {
  const chartConfig = await buildQuickChartConfig(env, mode);
  const chartUrl = `https://quickchart.io/chart?bkg=%230d1321&width=650&height=360&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

  const counts = chartConfig.data.datasets[0].data;
  const totalVisits = counts.reduce((a, b) => a + b, 0);

  const discordEmbed = {
    username: "Urbex Analytics Terminal",
    embeds: [{
      title: `📈 Raport i Wykres Wizyt [/${mode.toUpperCase()}]`,
      description: `**Powód wyzwolenia:** ${triggerReason}\n**Tryb raportu:** /${mode} (${getModeDescription(mode)})\n**Oś Pozioma (X):** Czas\n**Oś Pionowa (Y):** Wizyty`,
      color: 3066993,
      fields: [
        { name: "📊 Suma wizyt w tym oknie", value: `**${totalVisits}** połączeń`, inline: true },
        { name: "🕒 Czas generowania", value: new Date().toLocaleTimeString("pl-PL"), inline: true },
        { name: "⚡ Dostępne komendy", value: "`/cd` (Dzień) | `/cw` (Tydzień) | `/cm` (Miesiąc) | `/cy` (Rok) | `/c` (All-time)", inline: false }
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

function getModeDescription(mode) {
  switch(mode) {
    case "cd": return "Dzień / Ostatnie 24 godziny";
    case "cw": return "Tydzień / Ostatnie 7 dni";
    case "cm": return "Miesiąc / Ostatnie 30 dni";
    case "cy": return "Rok / Ostatnie 12 miesięcy";
    case "c": default: return "Pełna historia od 1. do ostatniej wizyty";
  }
}

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
      return true;
    }
  }
}
