// Vercel entry for the personal flight search. Serves only the /api/personal/*
// routes — the full server.js (scheduler, SQLite, SSE dashboard) is not deployed.
import express from "express";
import { loadConfig } from "../lib/config.js";
import { loadAirlineDirectory } from "../lib/airlineLinks.js";
import { createPersonalSearchService } from "../lib/personal-search.js";
import { suggestPlaces } from "../lib/duffel.js";
import { getSupabaseClient } from "../lib/supabase-client.js";

const config = loadConfig(process.env);
loadAirlineDirectory(config.airlinesFile);

const personalSearchService =
  config.supabaseUrl && config.supabaseServiceRoleKey
    ? createPersonalSearchService({ config, supabase: getSupabaseClient(config) })
    : null;

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/personal/places", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      res.json({ ok: true, places: [] });
      return;
    }
    const places = await suggestPlaces(config, q);
    res.json({ ok: true, places });
  } catch (err) {
    console.error("[personal] places failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/personal/flights", async (req, res) => {
  try {
    if (!personalSearchService) {
      res.status(503).json({ ok: false, error: "Personal search is not configured" });
      return;
    }
    const result = await personalSearchService.searchFlights(req.body || {});
    console.log(`[personal] flights: ${result.offers.length} offers, ${result.pairsSearched} pairs, ${result.durationMs}ms`);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[personal] flights failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/personal/stays", async (req, res) => {
  try {
    if (!personalSearchService) {
      res.status(503).json({ ok: false, error: "Personal search is not configured" });
      return;
    }
    const result = await personalSearchService.searchStaysForLocation(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[personal] stays failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default app;
