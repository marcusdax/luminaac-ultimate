// A YouTube channel for the Bridge's "Link a channel". Uses only YouTube's
// official, public interfaces:
//   • Every channel has an uploads playlist ("UU" + the id after "UC"), which
//     YouTube's own privacy-enhanced player can play. That needs nothing else.
//   • With YOUTUBE_API_KEY set (YouTube Data API v3, free quota), @handles are
//     resolved and the newest videos come back with titles for picture tiles.
//   • Without a key, the channel's public RSS feed is tried for the titles.
// Results are cached for 30 minutes.
const ID = /^UC[\w-]{22}$/;
const HANDLE = /^@[\w.-]{3,100}$/;
const cache = new Map();
const TTL = 30 * 60e3;
const err = (status, message) => Object.assign(new Error(message), { status });
const decode = (s = "") => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
export const uploads = (id) => "UU" + id.slice(2);
export const NEED_ID = "To link by @name, the server needs a YouTube key. Instead, paste the channel's link that has /channel/UC… in it (on YouTube: the channel's About section, Share channel, Copy channel ID).";

// What the parent typed -> { id } or { handle }.
export function parse(input) {
  const s = String(input || "").trim();
  if (!s || s.length > 200) return null;
  if (ID.test(s)) return { id: s };
  if (HANDLE.test(s)) return { handle: s };
  let u; try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { return null; }
  if (!/^(www\.|m\.)?youtube\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "channel" && ID.test(parts[1] || "")) return { id: parts[1] };
  if (HANDLE.test(parts[0] || "")) return { handle: parts[0] };
  return null;
}

export function feed(xml) {
  const title = decode(/<title>([^<]*)<\/title>/.exec(xml)?.[1] || "");
  const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    yt: /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(e)?.[1],
    title: decode(/<title>([^<]*)<\/title>/.exec(e)?.[1] || "").slice(0, 120),
    published: Date.parse(/<published>([^<]*)<\/published>/.exec(e)?.[1] || "") || 0,
  })).filter((v) => v.yt);
  return { title, videos };
}

async function api(path, key, fetchImpl) {
  const r = await fetchImpl(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw err(502, `YouTube said ${r.status}. Try again later.`);
  return r.json();
}

export async function channel(input, { fetchImpl = fetch, key = process.env.YOUTUBE_API_KEY } = {}) {
  const want = parse(input);
  if (!want) throw err(400, "That doesn't look like a YouTube channel. Paste the channel's link or its @name.");
  if (want.handle && !key) throw err(400, NEED_ID);
  const k = want.id || want.handle.toLowerCase(), hit = cache.get(k);
  if (hit && Date.now() - hit.t < TTL) return hit.data;
  let id = want.id, title = "", videos = [];
  if (key) {
    const c = await api(`channels?part=snippet&${id ? `id=${id}` : `forHandle=${encodeURIComponent(want.handle)}`}`, key, fetchImpl);
    const ch = c.items?.[0]; if (!ch) throw err(404, "YouTube has no channel with that name.");
    id = ch.id; title = ch.snippet?.title || "";
    const pl = await api(`playlistItems?part=snippet&maxResults=15&playlistId=${uploads(id)}`, key, fetchImpl);
    videos = (pl.items || []).map((x) => ({ yt: x.snippet?.resourceId?.videoId, title: String(x.snippet?.title || "").slice(0, 120), published: Date.parse(x.snippet?.publishedAt || "") || 0 })).filter((v) => /^[\w-]{11}$/.test(v.yt || "") && v.title !== "Private video");
  } else {
    try { // plain request to the public feed; fine if YouTube has it switched off
      const r = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) ({ title, videos } = feed(await r.text()));
    } catch {}
  }
  const data = { id, title, playlist: uploads(id), videos, fetched: Date.now() };
  cache.set(k, { t: Date.now(), data }); cache.set(id, { t: Date.now(), data });
  return data;
}
