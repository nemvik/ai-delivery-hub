import http from "node:http";
import { DatabaseSync } from "node:sqlite";
const [port, database, runId, fail] = process.argv.slice(2);
const db = new DatabaseSync(database);
db.exec(
  "CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,name TEXT NOT NULL)",
);
const style =
  "<style>body{font:18px Georgia;background:#f2f3ee;color:#193e35;margin:70px auto;max-width:760px}h1{font-size:48px}input,button{font:inherit;padding:14px;border:1px solid #abb9ae;border-radius:6px}button{background:#194d3e;color:white}small{font:13px monospace}li{padding:16px;background:white;margin:10px 0}</style>";
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Hub-Run", runId);
  if (req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ runId }));
    return;
  }
  if (req.url === "/api/participants" && req.method === "POST") {
    let data = "";
    for await (const c of req) {
      data += c;
      if (data.length > 4000) {
        res.writeHead(413);
        res.end();
        return;
      }
    }
    try {
      const { name, id } = JSON.parse(data);
      if (typeof name !== "string" || typeof id !== "string") throw Error();
      db.prepare("INSERT INTO participants VALUES(?,?)").run(id, name);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ id, displayName: name }));
    } catch {
      res.writeHead(400);
      res.end("{}");
    }
    return;
  }
  if (req.url === "/api/participants") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        fail === "true"
          ? []
          : db
              .prepare("SELECT id, name, name AS displayName FROM participants")
              .all(),
      ),
    );
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url === "/admin")
    res.end(
      `${style}<small>DEMO / ADMIN / ${runId}</small><h1>Guest desk</h1><p>Registrations received by the backend.</p><ul id="guests"></ul><script>fetch('/api/participants').then(r=>r.json()).then(rows=>rows.forEach(r=>{const li=document.createElement('li');li.textContent=r.name;li.dataset.id=r.id;document.querySelector('ul').append(li)}))</script>`,
    );
  else
    res.end(
      `${style}<small>DEMO / LIVE / ${runId}</small><h1>See you at the summit.</h1><p>A real registration, checked across two surfaces.</p><form><label>Your name <input name="name" required></label><button>Register</button></form><p role="status"></p><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const id=crypto.randomUUID();const name=new FormData(e.target).get('name');const r=await fetch('/api/participants',{method:'POST',body:JSON.stringify({id,name})});if(r.ok){document.querySelector('[role=status]').textContent='Registered: '+name;document.querySelector('[role=status]').dataset.id=id;}}</script>`,
    );
});
server.listen(Number(port), "127.0.0.1", () => console.log("ready " + runId));
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
