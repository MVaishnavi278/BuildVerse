const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 4173;
const PUBLIC = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const clients = new Set();

function now() {
  return new Date().toISOString();
}
function plusMinutes(n) {
  return new Date(Date.now() + n * 60000).toISOString();
}
function seed() {
  const student = randomUUID();
  const club = randomUUID();
  const admin = randomUUID();
  return {
    users: [
      { id: student, name: "Vaishnavi", roll: "25115060", email: "vaishnavi@campus.edu", role: "student", contact: "+91 98765 10101" },
      { id: club, name: "Cultural Committee", roll: "CLUB001", email: "culture@campus.edu", role: "club", contact: "culture@campus.edu" },
      { id: admin, name: "Admin Desk", roll: "ADMIN", email: "admin@campus.edu", role: "admin", contact: "admin@campus.edu" }
    ],
    posts: [
      {
        id: randomUUID(), userId: student, author: "Vaishnavi", role: "student",
        title: "Dinner food split from Gate 2", body: "Ordering biryani. Need 3 more people before 8:30 PM.",
        tag: "#foodsplit", image: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=900&q=80",
        contact: "+91 98765 10101", expiresAt: plusMinutes(120), status: "active", pinned: false, createdAt: now()
      },
      {
        id: randomUUID(), userId: student, author: "Aarav Student", role: "student",
        title: "Lost black calculator", body: "Last seen near Mechanical block M-204.",
        tag: "#lost", image: "https://images.unsplash.com/photo-1564473185935-58113cba1e80?auto=format&fit=crop&w=900&q=80",
        contact: "+91 98765 10101", expiresAt: null, status: "active", pinned: false, createdAt: now()
      }
    ],
    official: [
      { id: randomUUID(), userId: club, author: "Cultural Committee", role: "club", title: "Open mic registrations", body: "Register using the committee form before Friday.", createdAt: now() }
    ],
    events: [
      { id: randomUUID(), title: "Open Mic Night", date: "2026-06-30", time: "18:00", venue: "Main Auditorium", body: "Music, poetry, and stand-up.", owner: "Cultural Committee", status: "approved", createdAt: now() }
    ],
    complaints: [
      { id: randomUUID(), title: "Library AC not working", body: "Reading hall has been hot for two days.", realUserId: student, realUser: "Aarav Student", status: "open", createdAt: now(), resolvedAt: null }
    ],
    chats: {}
  };
}
function db() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(seed(), null, 2));
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", c => raw += c);
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
}
function user(req, data) {
  return data.users.find(u => u.id === req.headers["x-user-id"]) || null;
}
function needUser(req, res, data) {
  const u = user(req, data);
  if (!u) json(res, 401, { error: "Login required" });
  return u;
}
function mode(tag) {
  if (["#foodsplit", "#cabsplit", "#resell"].includes(tag)) return "chat";
  if (["#lost", "#found"].includes(tag)) return "contact";
  return "feed";
}
function publicState(data, u) {
  return {
    user: u,
    users: data.users,
    posts: data.posts.filter(p => p.status === "active").sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt) - new Date(a.createdAt)).map(p => ({ ...p, mode: mode(p.tag), chats: (data.chats[p.id] || []).length })),
    official: data.official.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    events: data.events.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    complaints: data.complaints.map(c => ({ ...c, realUser: u && u.role === "admin" ? c.realUser : undefined })),
    admin: u && u.role === "admin" ? { allPosts: data.posts, allComplaints: data.complaints } : null
  };
}
function ping(reason) {
  for (const res of clients) res.write(`event: update\ndata: ${JSON.stringify({ reason })}\n\n`);
}
function expire() {
  const data = db();
  let changed = false;
  for (const p of data.posts) {
    if (p.status === "active" && p.expiresAt && new Date(p.expiresAt) <= new Date()) {
      p.status = "expired";
      changed = true;
    }
  }
  if (changed) {
    save(data);
    ping("expiry-job");
  }
}
async function api(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const data = db();

  try {
    if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, publicState(data, user(req, data)));

    if (req.method === "POST" && url.pathname === "/api/login") {
      const b = await body(req);
      let u = data.users.find(x => x.roll.toLowerCase() === String(b.roll || "").toLowerCase() && x.email.toLowerCase() === String(b.email || "").toLowerCase());
      if (!u && b.roll && b.email) {
        u = { id: randomUUID(), name: b.name || `Student ${b.roll}`, roll: b.roll, email: b.email, role: "student", contact: b.contact || b.email };
        data.users.push(u); save(data);
      }
      return u ? json(res, 200, { user: u, state: publicState(data, u) }) : json(res, 401, { error: "Invalid login" });
    }

    if (req.method === "POST" && url.pathname === "/api/posts") {
      const u = needUser(req, res, data); if (!u) return;
      const b = await body(req);
      const tag = String(b.tag || "").startsWith("#") ? b.tag.toLowerCase() : `#${String(b.tag || "").toLowerCase()}`;
      if (!b.title || !b.body || !tag) return json(res, 400, { error: "Title, description, and hashtag required" });
      const p = {
        id: randomUUID(), userId: u.id, author: u.name, role: u.role,
        title: b.title, body: b.body, tag,
        image: b.image || "https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=900&q=80",
        contact: b.contact || u.contact, expiresAt: mode(tag) === "chat" ? plusMinutes(Math.max(10, Math.min(2880, Number(b.minutes || 1440)))) : null,
        status: "active", pinned: false, createdAt: now()
      };
      data.posts.push(p); save(data); ping("post"); return json(res, 201, p);
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/posts/")) {
      const u = needUser(req, res, data); if (!u) return;
      const p = data.posts.find(x => x.id === url.pathname.split("/")[3]);
      if (!p) return json(res, 404, { error: "Post not found" });
      if (u.role !== "admin" && p.userId !== u.id) return json(res, 403, { error: "Not allowed" });
      const b = await body(req);
      if (u.role === "admin" && typeof b.pinned === "boolean") p.pinned = b.pinned;
      if (["active", "expired", "removed"].includes(b.status)) p.status = b.status;
      save(data); ping("post-update"); return json(res, 200, p);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/chats/")) {
      return json(res, 200, data.chats[url.pathname.split("/")[3]] || []);
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/chats/")) {
      const u = needUser(req, res, data); if (!u) return;
      const postId = url.pathname.split("/")[3];
      const p = data.posts.find(x => x.id === postId && x.status === "active");
      if (!p || mode(p.tag) !== "chat") return json(res, 404, { error: "Live room unavailable" });
      const b = await body(req);
      const msg = { id: randomUUID(), userId: u.id, author: u.name, text: b.text, createdAt: now() };
      data.chats[postId] ||= [];
      data.chats[postId].push(msg);
      save(data); ping("chat"); return json(res, 201, msg);
    }

    if (req.method === "POST" && url.pathname === "/api/official") {
      const u = needUser(req, res, data); if (!u) return;
      if (!["club", "admin"].includes(u.role)) return json(res, 403, { error: "Only club/admin can post here" });
      const b = await body(req);
      const item = { id: randomUUID(), userId: u.id, author: u.name, role: u.role, title: b.title, body: b.body, createdAt: now() };
      data.official.push(item); save(data); ping("official"); return json(res, 201, item);
    }

    if (req.method === "POST" && url.pathname === "/api/events") {
      const u = needUser(req, res, data); if (!u) return;
      const b = await body(req);
      const ev = { id: randomUUID(), title: b.title, date: b.date, time: b.time, venue: b.venue, body: b.body || "", owner: u.name, status: ["club", "admin"].includes(u.role) ? "approved" : "requested", createdAt: now() };
      data.events.push(ev); save(data); ping("event"); return json(res, 201, ev);
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/events/")) {
      const u = needUser(req, res, data); if (!u || u.role !== "admin") return json(res, 403, { error: "Admin only" });
      const ev = data.events.find(x => x.id === url.pathname.split("/")[3]);
      const b = await body(req);
      ev.status = b.status; save(data); ping("event-update"); return json(res, 200, ev);
    }

    if (req.method === "POST" && url.pathname === "/api/complaints") {
      const u = needUser(req, res, data); if (!u) return;
      const b = await body(req);
      const c = { id: randomUUID(), title: b.title, body: b.body, realUserId: u.id, realUser: u.name, status: "open", createdAt: now(), resolvedAt: null };
      data.complaints.push(c); save(data); ping("complaint"); return json(res, 201, c);
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/complaints/")) {
      const u = needUser(req, res, data); if (!u) return;
      const c = data.complaints.find(x => x.id === url.pathname.split("/")[3]);
      if (u.role !== "admin" && c.realUserId !== u.id) return json(res, 403, { error: "Not allowed" });
      c.status = "resolved"; c.resolvedAt = now(); save(data); ping("complaint-update"); return json(res, 200, c);
    }

    json(res, 404, { error: "Not found" });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
function live(req, res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`event: update\ndata: {"reason":"connected"}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
}
function file(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const name = url.pathname === "/" ? "/index.html" : url.pathname;
  const target = path.normalize(path.join(PUBLIC, name));
  if (!target.startsWith(PUBLIC)) return res.end("Forbidden");
  fs.readFile(target, (err, buf) => {
    if (err) return res.writeHead(404).end("Not found");
    const ext = path.extname(target);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
    res.writeHead(200, { "Content-Type": types[ext] || "text/plain", "Cache-Control": "no-store" });
    res.end(buf);
  });
}
setInterval(expire, 15000);
http.createServer((req, res) => {
  if (req.url === "/api/live") return live(req, res);
  if (req.url.startsWith("/api/")) return api(req, res);
  file(req, res);
}).listen(PORT, () => console.log(`Campus Buzz running at http://localhost:${PORT}`));