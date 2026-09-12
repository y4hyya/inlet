import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { planFor } from "../dist/timeline.js";

const tty = Boolean(process.stdout.isTTY);
const paint = tty ? (code, value) => `\x1b[${code}m${value}\x1b[0m` : (_, value) => value;
const green = (value) => paint("38;5;114", value);
const orange = (value) => paint("38;5;209", value);
const grey = (value) => paint("38;5;245", value);
const bold = (value) => paint("1", value);
const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

process.on("exit", () => {
  if (tty) process.stdout.write("\x1b[?25h");
});

class Timeline {
  constructor(plan) {
    this.title = plan.title;
    this.steps = plan.steps.map((label) => ({ label, text: label, state: "pending", seconds: undefined }));
    this.steps[0].state = "active";
    this.since = Date.now();
    this.frame = 0;
    this.drawn = 0;
    this.warning = undefined;
    process.stdout.write("\n");
    if (tty) {
      process.stdout.write("\x1b[?25l");
      this.timer = setInterval(() => this.draw(), 80);
      this.draw();
    } else {
      console.log(this.title);
    }
  }

  advance(progress) {
    const message = progress.message ?? "";
    const open = this.steps.filter((step) => step.state !== "done");
    const step = open.find((entry) => message.startsWith(entry.label)) ?? open[0];
    if (!step) return;
    const now = Date.now();
    step.state = "done";
    step.text = message || step.label;
    step.seconds = (now - this.since) / 1000;
    this.since = now;
    for (const entry of this.steps) if (entry.state === "active") entry.state = "pending";
    const next = this.steps.find((entry) => entry.state === "pending");
    if (next) next.state = "active";
    if (tty) this.draw();
    else console.log(this.row(step, 0));
  }

  row(step, column) {
    const spinner = frames[this.frame % frames.length];
    const mark = step.state === "done" ? green("●") : step.state === "active" ? orange(spinner) : grey("○");
    const seconds = step.state === "done" ? step.seconds : step.state === "active" ? (Date.now() - this.since) / 1000 : undefined;
    const text = column && step.text.length > column - 2 ? `${step.text.slice(0, column - 3)}…` : step.text;
    const body = step.state === "pending" ? grey(text) : text;
    const pad = " ".repeat(Math.max(2, column - text.length));
    return `${mark} ${body}${seconds === undefined ? "" : `${pad}${grey(`${seconds.toFixed(1)}s`)}`}`;
  }

  rows() {
    const width = Math.max(48, (process.stdout.columns ?? 100) - 1);
    const column = Math.min(width - 8, Math.max(...this.steps.map((step) => Math.max(step.label.length + 18, step.text.length + 2))));
    const lines = [bold(this.title), ...this.steps.map((step) => this.row(step, column))];
    if (this.warning) lines.push(orange(this.warning));
    return lines;
  }

  draw() {
    this.frame += 1;
    const lines = this.rows();
    const up = this.drawn > 0 ? `\x1b[${this.drawn}A` : "";
    process.stdout.write(`${up}${lines.map((line) => `\x1b[2K${line}`).join("\n")}\n`);
    this.drawn = lines.length;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (tty) process.stdout.write("\x1b[?25h");
  }

  fail(message) {
    this.warning = message;
    for (const step of this.steps) if (step.state === "active") step.state = "pending";
    if (tty) this.draw();
    else console.log(orange(message));
    this.stop();
  }

  finish(body, elapsedMs) {
    let result;
    try {
      result = JSON.parse(body);
    } catch {
      result = undefined;
    }
    const state = result?.state;
    const delivered = state === "delivered" || state === "executed";
    for (const step of this.steps) {
      if (step.state === "active") step.state = delivered ? "done" : "pending";
      if (delivered && step.state === "pending") step.state = "done";
    }
    if (!delivered) this.warning = result ? `${state ?? "no state"}${result.error ? `, ${result.error}` : ""}` : body.slice(0, 200);
    if (tty) this.draw();
    else if (this.warning) console.log(orange(this.warning));
    this.stop();
    const total = `${(elapsedMs / 1000).toFixed(1)}s`;
    console.log(delivered ? `\n${green(bold(`Delivered in ${total}`))}` : `\n${orange(`Stopped after ${total}`)}`);
    for (const [label, url] of links(result)) console.log(`${grey(label.padEnd(9))}${url}`);
  }
}

function links(result) {
  if (!result || typeof result !== "object") return [];
  const rows = [];
  if (result.exitTx) rows.push(["redeem", result.exitTx]);
  for (const leg of result.legs ?? []) if (leg.mintTx) rows.push([String(leg.chain).split(" ")[0].toLowerCase(), leg.mintTx]);
  if (result.sourceTx) rows.push(["source", result.sourceTx]);
  if (result.arcMintTx) rows.push(["arc", result.arcMintTx]);
  if (result.sweepTx) rows.push(["sweep", result.sweepTx]);
  if (result.destinationTx) rows.push(["position", result.destinationTx]);
  if (result.statusPage) rows.push(["status", result.statusPage]);
  return rows;
}

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const [command, rest] = argv.filter((arg) => arg !== "--json");
const calls = JSON.parse(rest ?? "[]");
const transport = new StdioClientTransport({ command: "node", args: [command], env: { ...process.env } });
const client = new Client({ name: "probe", version: "0.0.1" });
await client.connect(transport);
if (calls.length === 0) {
  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((tool) => tool.name).join(", "));
}
for (const [name, args = {}] of calls) {
  const plan = planFor(name, args);
  const view = plan ? new Timeline(plan) : undefined;
  const started = Date.now();
  let result;
  try {
    result = await client.callTool({ name, arguments: args }, undefined, { onprogress: (progress) => view?.advance(progress) });
  } catch (error) {
    view?.fail(error instanceof Error ? error.message : String(error));
    await client.close();
    throw error;
  }
  const body = result.content?.[0]?.text ?? JSON.stringify(result);
  const elapsed = Date.now() - started;
  if (view) view.finish(body, elapsed);
  if (!view || json) console.log(`\n== ${name} (${Math.round(elapsed / 1000)}s)\n${json ? body : body.slice(0, 1200)}`);
}
await client.close();
