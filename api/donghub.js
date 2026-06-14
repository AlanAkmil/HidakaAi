const axios = require("axios");
const cheerio = require("cheerio");

const BASE = "https://donghub.vip";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const HEADERS = { "User-Agent": UA };

async function get(url) {
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  return cheerio.load(data);
}

function cardEgg($, el) {
  return {
    title: $(el).find(".eggtitle").text().trim() || "Unknown",
    episode: $(el).find(".eggepisode").text().trim() || null,
    url: $(el).find("a").attr("href") || null,
    thumbnail: $(el).find("img").attr("src") || null,
  };
}

async function home(page = 1) {
  const $ = await get(page <= 1 ? BASE : `${BASE}/page/${page}/`);
  const latest = [];
  $(".listupd.normal .styleegg").each((_, el) => latest.push(cardEgg($, el)));
  return { page, latest_episodes: latest.slice(0, 20) };
}

// Vercel Serverless Handler
module.exports = async (req, res) => {
  // Set CORS biar API lu gak diblokir
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const command = req.query.command || "home";
  const page = parseInt(req.query.page) || 1;

  try {
    let data;
    switch (command) {
      case "home":
        data = await home(page);
        break;
      // Tambahin case lain (detail, search, dll) dari script asli lu di sini
      default:
        return res.status(400).json({ error: "Command sampah, nggak dikenal." });
    }
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
};
