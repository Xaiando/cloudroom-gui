import assert from "node:assert/strict";

const port = Number(process.argv[2]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
});
async function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = ++id;
    const timeout = setTimeout(() => { pending.delete(request); reject(new Error(`Timeout: ${method}`)); }, 10_000);
    pending.set(request, (message) => {
      clearTimeout(timeout);
      pending.delete(request);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id: request, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(250);
  }
  throw new Error(`UI did not become ready: ${expression}`);
}
try {
  await until(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue locally')`);
  assert.equal(await evaluate("window.bbDesktop.platform"), "windows");
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue locally').click()`);
  await until(`!document.querySelector('[role="dialog"][aria-label="Set up Cloudroom"]')`);
  assert.equal(await evaluate(`localStorage.getItem('cloudroom.setup.dismissed')`), "true");
  await send("Page.reload");
  await until(`document.body?.innerText.includes('Plugins') && document.body.innerText.includes('New thread') && performance.getEntriesByType('navigation')[0]?.type === 'reload'`);
  assert.equal(await evaluate(`!!document.querySelector('[role="dialog"][aria-label="Set up Cloudroom"]')`), false);
  await until(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Automations')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Automations').click()`);
  await until(`document.body.innerText.includes('Installed') && document.body.innerText.includes('No automations installed')`);
  console.log("PASS: original Windows desktop, local onboarding persistence, and Automations panel");
} finally { socket.close(); }
