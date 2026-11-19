// Pluggable mailer with no npm dependencies.
//   MAIL_MODE=smtp     send over SMTP (node:net / node:tls), settings from env:
//                      SMTP_HOST, SMTP_PORT (587), SMTP_SECURE=1 for implicit TLS (465),
//                      SMTP_USER, SMTP_PASS, MAIL_FROM. STARTTLS is used whenever the
//                      server offers it; set SMTP_REQUIRE_TLS=0 only for a local test relay.
//   MAIL_MODE=outbox   (default) append to <data>/_outbox.json and print a short line.
//   MAIL_MODE=console  print the whole message to stdout.
// If you'd rather use nodemailer, replace send() with transporter.sendMail(msg); the
// rest of the backend only calls send({ to, subject, text }).
import net from "node:net";
import tls from "node:tls";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DIR } from "./store.js";

const OUT = join(DIR, "_outbox.json");
export const mode = () => (process.env.MAIL_MODE || "outbox").toLowerCase();
export function outbox() { try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return []; } }
const clean = (s) => String(s).replace(/[\r\n]+/g, " ").slice(0, 300); // no header injection

export async function send({ to, subject, text }) {
  const msg = { id: randomUUID(), to: clean(to), subject: clean(subject), text: String(text), t: Date.now(), from: clean(process.env.MAIL_FROM || "LuminAAC <no-reply@localhost>") };
  const m = mode();
  if (m === "smtp") { await smtp(msg); return { sent: true, via: "smtp", id: msg.id }; }
  if (m === "console") { console.log(`\n--- mail to ${msg.to}: ${msg.subject}\n${msg.text}\n---`); return { sent: true, via: "console", id: msg.id }; }
  const box = [msg, ...outbox()].slice(0, 200);
  const tmp = OUT + ".tmp"; writeFileSync(tmp, JSON.stringify(box, null, 1)); renameSync(tmp, OUT);
  if (!process.env.LUMINAAC_QUIET) console.log(`[outbox] ${msg.to}: ${msg.subject}`);
  return { sent: true, via: "outbox", id: msg.id };
}

function rfc822(msg) {
  const addr = (s) => (/<([^>]+)>/.exec(s) || [, s])[1];
  const body = msg.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, ".."); // dot-stuffing
  return { from: addr(msg.from), data: [`From: ${msg.from}`, `To: ${msg.to}`, `Subject: ${msg.subject}`, `Date: ${new Date(msg.t).toUTCString()}`, `Message-ID: <${msg.id}@luminaac>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", body].join("\r\n") };
}

// Minimal SMTP client: EHLO, STARTTLS, AUTH PLAIN/LOGIN, MAIL, RCPT, DATA, QUIT.
export async function smtp(msg, env = process.env) {
  const host = env.SMTP_HOST; if (!host) throw new Error("SMTP_HOST is not set");
  const port = Number(env.SMTP_PORT || (env.SMTP_SECURE === "1" ? 465 : 587));
  const requireTls = env.SMTP_REQUIRE_TLS !== "0";
  let sock = env.SMTP_SECURE === "1" ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  sock.setTimeout(20000, () => sock.destroy(new Error("SMTP timeout")));
  let buf = "", waiter = null;
  const attach = (s) => { s.setEncoding("utf8"); s.on("data", (d) => { buf += d; pump(); }); s.on("error", (e) => waiter?.rej(e)); };
  function pump() {
    if (!waiter) return;
    const lines = buf.split("\r\n"); // a reply ends with "NNN " (space) on its last line
    for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) {
      const reply = lines.slice(0, i + 1).join("\n"); buf = lines.slice(i + 1).join("\r\n");
      const w = waiter; waiter = null; w.res({ code: +lines[i].slice(0, 3), text: reply }); return;
    }
  }
  const read = () => new Promise((res, rej) => { waiter = { res, rej }; pump(); });
  const cmd = async (line, okCodes) => { if (line != null) sock.write(line + "\r\n"); const r = await read(); if (!okCodes.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.text.split("\n").pop()}`); return r; };
  attach(sock);
  try {
    await cmd(null, [220]);
    let ehlo = await cmd("EHLO luminaac.local", [250]);
    if (!(sock instanceof tls.TLSSocket)) {
      if (/STARTTLS/i.test(ehlo.text)) {
        await cmd("STARTTLS", [220]);
        sock.removeAllListeners("data");
        sock = tls.connect({ socket: sock, servername: host }); attach(sock);
        await new Promise((r, j) => { sock.once("secureConnect", r); sock.once("error", j); });
        ehlo = await cmd("EHLO luminaac.local", [250]);
      } else if (requireTls) throw new Error("SMTP server does not offer STARTTLS (set SMTP_REQUIRE_TLS=0 for a local relay)");
    }
    if (env.SMTP_USER) {
      if (/AUTH[^\n]*PLAIN/i.test(ehlo.text)) await cmd("AUTH PLAIN " + Buffer.from(`\0${env.SMTP_USER}\0${env.SMTP_PASS || ""}`).toString("base64"), [235]);
      else { await cmd("AUTH LOGIN", [334]); await cmd(Buffer.from(env.SMTP_USER).toString("base64"), [334]); await cmd(Buffer.from(env.SMTP_PASS || "").toString("base64"), [235]); }
    }
    const { from, data } = rfc822(msg);
    await cmd(`MAIL FROM:<${from}>`, [250]);
    await cmd(`RCPT TO:<${(/<([^>]+)>/.exec(msg.to) || [, msg.to])[1]}>`, [250, 251]);
    await cmd("DATA", [354]);
    await cmd(data + "\r\n.", [250]);
    await cmd("QUIT", [221]).catch(() => {});
  } finally { sock.end(); }
}
