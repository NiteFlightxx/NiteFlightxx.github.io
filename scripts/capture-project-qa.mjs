import { writeFile } from "node:fs/promises";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4321/#projects";
const outputPrefix = process.argv[3] ?? "drone-project";
const port = process.argv[4] ?? "9222";

const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const pageTarget = tabs.find((entry) => entry.type === "page");
if (!pageTarget) throw new Error("No Chrome page target available");

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const consoleProblems = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    consoleProblems.push(details?.exception?.description ?? details?.text ?? "Runtime exception");
  }
  if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
    consoleProblems.push(`${message.params.entry.level}: ${message.params.entry.text}`);
  }
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
    consoleProblems.push(`${message.params.type}: ${message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ")}`);
  }
});

function call(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) {
  const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result?.value;
}

await call("Page.enable");
await call("Runtime.enable");
await call("Log.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await call("Page.navigate", { url: baseUrl });
await delay(2500);
await evaluate(`localStorage.setItem("theme", "dark")`);
const clickedTitle = await evaluate(`
  (() => {
    const target = [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("无人机基础原理"));
    if (!target) throw new Error("Drone project card not found");
    target.click();
    return target.textContent?.trim();
  })()
`);
for (let attempt = 0; attempt < 20; attempt += 1) {
  if (await evaluate(`Boolean(document.querySelector("#drone-flight-lab"))`)) break;
  await delay(250);
}
if (!(await evaluate(`Boolean(document.querySelector("#drone-flight-lab"))`))) {
  throw new Error(`Drone flight lab did not open after clicking: ${clickedTitle}`);
}
await delay(1400);

const desktop = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(`${outputPrefix}-desktop.png`, Buffer.from(desktop.data, "base64"));

await evaluate(`
  (() => {
    const attitude = document.querySelector('button[aria-label*="第 2 课"]');
    if (!attitude) throw new Error("Attitude lesson control not found");
    attitude.click();
  })()
`);
await delay(500);

await call("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await delay(800);
const mobile = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(`${outputPrefix}-mobile.png`, Buffer.from(mobile.data, "base64"));

const facts = await evaluate(`({
  title: document.querySelector("#drone-project-title")?.textContent?.trim(),
  labVisible: Boolean(document.querySelector("#drone-flight-lab")),
  desktopGrid: getComputedStyle(document.querySelector("#drone-flight-lab > div:last-child")).gridTemplateColumns,
  bodyOverflow: document.body.style.overflow,
  activeLesson: document.querySelector('[aria-current="step"]')?.getAttribute("aria-label"),
  viewport: [innerWidth, innerHeight],
})`);

await writeFile(
  `${outputPrefix}-runtime.json`,
  `${JSON.stringify({ facts, consoleProblems }, null, 2)}\n`,
);

socket.close();
