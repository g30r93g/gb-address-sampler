// demo.mjs
// Usage:
//   node demo.mjs
//   node demo.mjs --n 3
//   node demo.mjs --polygon ./poly.geojson --n 5 --base http://localhost:3000

import fs from "node:fs";
import { io } from "socket.io-client";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) {
      const k = cur.slice(2);
      const v = arr[i + 1]?.startsWith("--") ? true : arr[i + 1];
      acc.push([k, v === undefined ? true : v]);
    }
    return acc;
  }, [])
);

const BASE_URL = args.base || process.env.API_BASE || "http://localhost:3000";
const N = Number(args.n || 3);

// Default polygon: small box in central London (WGS84 lon/lat)
const defaultPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-0.15333263205036454, 51.65357400909667],
      [-0.11796920746246552, 51.65081934523486],
      [-0.10402635944212646, 51.63926726533617],
      [-0.13012051635169955, 51.630806762703116],
      [-0.16096614660898595, 51.63902555859106],
      [-0.15333263205036454, 51.65357400909667]
    ],
  ],
};

const polygon =
  args.polygon
    ? JSON.parse(fs.readFileSync(args.polygon, "utf8"))
    : defaultPolygon;

async function postSample() {
  const res = await fetch(`${BASE_URL}/sample`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ polygon, n: N }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`POST /sample ${res.status} ${res.statusText}: ${body}`);
  }
  const json = await res.json();
  if (!json.jobId) throw new Error("No jobId in response");
  return json.jobId;
}

function listen(jobId) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { transports: ["websocket"] });

    socket.on("connect", () => {
      console.log(`[client] Connected as ${socket.id}`);
      socket.emit("join", jobId);
      console.log(`[client] Joined room ${jobId}`);
    });

    const onEvt = (evt) => (msg) => {
      if (!msg || msg.jobId !== jobId) return;
      if (evt === "progress") {
        const p = typeof msg.progress === "number" ? `${msg.progress}%` : "";
        console.log(`[progress] ${p} ${msg.currentStep || ""}`.trim());
      } else if (evt === "complete") {
        console.log(`[complete] Received ${Array.isArray(msg.result) ? msg.result.length : 0} addresses`);
        console.dir(msg.result, { depth: null });
        socket.close();
        resolve();
      } else if (evt === "error") {
        console.error(`[error] ${msg.error || "unknown error"}`);
        socket.close();
        reject(new Error(msg.error || "worker error"));
      }
    };

    socket.on("progress", onEvt("progress"));
    socket.on("complete", onEvt("complete"));
    socket.on("error", onEvt("error"));

    socket.on("connect_error", (e) => {
      console.error(`[client] connect_error: ${e.message}`);
    });

    // Optional overall timeout
    const timeoutMs = Number(args.timeout || 120_000);
    const t = setTimeout(() => {
      console.error(`[timeout] No completion within ${timeoutMs}ms`);
      socket.close();
      reject(new Error("timeout"));
    }, timeoutMs);

    // Clear timeout on finish
    const clear = () => clearTimeout(t);
    socket.on("disconnect", clear);
    socket.on("complete", clear);
    socket.on("error", clear);
  });
}

(async () => {
  console.log(`[post] ${BASE_URL}/sample  n=${N}`);
  const jobId = await postSample();
  console.log(`[post] jobId=${jobId}`);
  await listen(jobId);
})().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
