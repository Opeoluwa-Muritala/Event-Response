import express from "express";
import { createServer as createViteServer } from "vite";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";
import NodeCache from "node-cache";
import cron from "node-cron";
import { z } from "zod";
import { scrapeAllCategories } from "./scraper/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new DatabaseSync("community.db");
const cache = new NodeCache({ stdTTL: 10, checkperiod: 30 });

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    status TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    link TEXT,
    imageUrl TEXT,
    base64Image TEXT,
    priceData TEXT,
    upvotes INTEGER NOT NULL DEFAULT 0,
    downvotes INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS event_votes (
    event_id TEXT NOT NULL,
    voter_key TEXT NOT NULL,
    value INTEGER NOT NULL CHECK(value IN (-1, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, voter_key),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );
`);

const EventSchema = z.object({
  description: z.string().min(1),
  location: z.object({
    lat: z.number().finite(),
    lng: z.number().finite(),
  }),
  status: z.enum(["active", "past", "false", "responded", "deleted"]).default("active"),
  timestamp: z.number().int().nonnegative(),
  type: z.string().min(1),
  link: z.string().url().optional(),
  imageUrl: z.string().optional(),
  base64Image: z.string().optional(),
  priceData: z
    .object({
      item: z.string(),
      price: z.string(),
      unit: z.string(),
    })
    .optional(),
});

const BulkEventSchema = z.array(EventSchema).min(1);

function requireAdmin(req: express.Request, res: express.Response): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(500).json({ error: "Server admin token is not configured" });
    return false;
  }
  const token = req.header("x-admin-token");
  if (token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function makeEventId(e: z.infer<typeof EventSchema>) {
  // Deterministic-ish ID to de-dupe bulk inserts.
  // (type + timestamp + rounded coords)
  const lat = e.location.lat.toFixed(5);
  const lng = e.location.lng.toFixed(5);
  return `${e.type}:${e.timestamp}:${lat},${lng}`;
}

function getVoterKey(req: express.Request) {
  // Minimal anti-spam key (not a true auth system).
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const ua = req.header("user-agent") || "unknown";
  return `${ip}::${ua}`.slice(0, 255);
}

async function runDailyScrape() {
  const items = await scrapeAllCategories();
  if (!items.length) {
    console.log("[scraper] no items");
    return;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events
      (id, type, description, lat, lng, status, timestamp, link, imageUrl, base64Image, priceData)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const raw of items) {
      const parsed = EventSchema.parse(raw);
      const id = makeEventId(parsed);
      stmt.run(
        id,
        parsed.type,
        parsed.description,
        parsed.location.lat,
        parsed.location.lng,
        parsed.status,
        parsed.timestamp,
        parsed.link ?? null,
        parsed.imageUrl ?? null,
        parsed.base64Image ?? null,
        parsed.priceData ? JSON.stringify(parsed.priceData) : null
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  cache.flushAll();
  console.log(`[scraper] inserted attempt: ${items.length}`);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Daily scraper (02:10 UTC). Disable with SCRAPER_DISABLED=1
  if (process.env.SCRAPER_DISABLED !== "1") {
    cron.schedule("10 2 * * *", () => {
      runDailyScrape().catch((err) => console.error("[scraper] failed", err));
    }, { timezone: "UTC" });
  }

  // API Routes
  app.get("/api/responses", (req, res) => {
    try {
      const responses = db.prepare("SELECT * FROM responses ORDER BY created_at DESC").all();
      res.json(responses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch responses" });
    }
  });

  app.post("/api/responses", (req, res) => {
    const { name, email, category, message } = req.body;
    if (!name || !email || !category || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    try {
      const info = db.prepare(
        "INSERT INTO responses (name, email, category, message, likes) VALUES (?, ?, ?, ?, 0)"
      ).run(name, email, category, message);
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to save response" });
    }
  });

  app.post("/api/responses/:id/like", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE responses SET likes = likes + 1 WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to like response" });
    }
  });

  app.get("/api/stats", (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT 
          category, 
          COUNT(*) as count 
        FROM responses 
        GROUP BY category
      `).all();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Map/events API
  // Optional bbox query params to reduce payload:
  //   minLat, minLng, maxLat, maxLng, since (timestamp ms)
  app.get("/api/events", (req, res) => {
    try {
      const minLat = req.query.minLat ? Number(req.query.minLat) : null;
      const minLng = req.query.minLng ? Number(req.query.minLng) : null;
      const maxLat = req.query.maxLat ? Number(req.query.maxLat) : null;
      const maxLng = req.query.maxLng ? Number(req.query.maxLng) : null;
      const since = req.query.since ? Number(req.query.since) : null;

      const cacheKey = JSON.stringify({ minLat, minLng, maxLat, maxLng, since });
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);

      const where: string[] = ["status != 'deleted'"];
      const params: any[] = [];

      if ([minLat, minLng, maxLat, maxLng].every((v) => typeof v === "number" && Number.isFinite(v))) {
        where.push("lat BETWEEN ? AND ?");
        params.push(minLat, maxLat);
        where.push("lng BETWEEN ? AND ?");
        params.push(minLng, maxLng);
      }
      if (typeof since === "number" && Number.isFinite(since)) {
        where.push("timestamp >= ?");
        params.push(since);
      }

      const sql = `
        SELECT id, type, description, lat, lng, status, timestamp, link, imageUrl, base64Image, priceData, upvotes, downvotes
        FROM events
        WHERE ${where.join(" AND ")}
        ORDER BY timestamp DESC
        LIMIT 2000
      `;
      const rows = db.prepare(sql).all(...params) as any[];

      const shaped = rows.map((r) => ({
        id: r.id,
        type: r.type,
        description: r.description,
        location: { lat: r.lat, lng: r.lng },
        status: r.status,
        timestamp: r.timestamp,
        link: r.link || undefined,
        imageUrl: r.imageUrl || undefined,
        base64Image: r.base64Image || undefined,
        priceData: r.priceData ? JSON.parse(r.priceData) : undefined,
        votes: { up: r.upvotes, down: r.downvotes },
      }));

      cache.set(cacheKey, shaped);
      res.json(shaped);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Public: submit a single event (used by report form / scraper).
  app.post("/api/events", (req, res) => {
    const parse = EventSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid payload", details: parse.error.flatten() });
    }
    const e = parse.data;
    const id = makeEventId(e);

    try {
      db.prepare(`
        INSERT OR IGNORE INTO events
          (id, type, description, lat, lng, status, timestamp, link, imageUrl, base64Image, priceData)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        e.type,
        e.description,
        e.location.lat,
        e.location.lng,
        e.status,
        e.timestamp,
        e.link ?? null,
        e.imageUrl ?? null,
        e.base64Image ?? null,
        e.priceData ? JSON.stringify(e.priceData) : null
      );
      cache.flushAll();
      res.status(201).json({ id });
    } catch (error) {
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // Voting: { value: 1 | -1 }
  app.post("/api/events/:id/vote", (req, res) => {
    const id = req.params.id;
    const value = req.body?.value;
    if (value !== 1 && value !== -1) {
      return res.status(400).json({ error: "value must be 1 or -1" });
    }

    try {
      const voterKey = getVoterKey(req);

      const existing = db
        .prepare("SELECT value FROM event_votes WHERE event_id = ? AND voter_key = ?")
        .get(id, voterKey) as any;

      db.exec("BEGIN");
      try {
        if (!existing) {
          db.prepare("INSERT INTO event_votes (event_id, voter_key, value) VALUES (?, ?, ?)").run(
            id,
            voterKey,
            value
          );
          if (value === 1) db.prepare("UPDATE events SET upvotes = upvotes + 1, updated_at=CURRENT_TIMESTAMP WHERE id = ?").run(id);
          if (value === -1) db.prepare("UPDATE events SET downvotes = downvotes + 1, updated_at=CURRENT_TIMESTAMP WHERE id = ?").run(id);
        } else if (existing.value !== value) {
          db.prepare("UPDATE event_votes SET value = ? WHERE event_id = ? AND voter_key = ?").run(
            value,
            id,
            voterKey
          );
          // flip: -1 -> +1 or +1 -> -1
          if (value === 1) {
            db.prepare("UPDATE events SET upvotes = upvotes + 1, downvotes = downvotes - 1, updated_at=CURRENT_TIMESTAMP WHERE id = ?").run(id);
          } else {
            db.prepare("UPDATE events SET downvotes = downvotes + 1, upvotes = upvotes - 1, updated_at=CURRENT_TIMESTAMP WHERE id = ?").run(id);
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      cache.flushAll();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to vote" });
    }
  });

  // Admin: update status { status: "past" | "false" | "active" | ... }
  app.patch("/api/admin/events/:id/status", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = req.params.id;
    const status = req.body?.status;
    const allowed = new Set(["active", "past", "false", "responded", "deleted"]);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    try {
      db.prepare("UPDATE events SET status = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
      cache.flushAll();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // Admin: bulk insert JSON array
  app.post("/api/admin/events/bulk", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const parse = BulkEventSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid payload", details: parse.error.flatten() });
    }

    const events = parse.data.map((e) => ({ ...e, id: makeEventId(e) }));
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO events
          (id, type, description, lat, lng, status, timestamp, link, imageUrl, base64Image, priceData)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      db.exec("BEGIN");
      try {
        for (const e of events) {
          stmt.run(
            e.id,
            e.type,
            e.description,
            e.location.lat,
            e.location.lng,
            e.status,
            e.timestamp,
            e.link ?? null,
            e.imageUrl ?? null,
            e.base64Image ?? null,
            e.priceData ? JSON.stringify(e.priceData) : null
          );
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      cache.flushAll();
      res.json({ success: true, insertedAttempted: events.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to bulk insert" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
