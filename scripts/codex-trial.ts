import { isolatedSkillConfig } from "./trial-cli.js";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, cp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { startTestServer } from "../tests/test-service.js";
import { tenItemPlan, fixtureSvg } from "../tests/fixture.js";
import { PlanError } from "../src/contract/errors.js";
import type { Plan } from "../src/contract/plan.js";

const mode = process.argv[2] ?? "selected";
if (
  !["planning", "selected", "unrelated", "missing-asset", "offline"].includes(
    mode,
  )
)
  throw new Error(
    "Choose planning, selected, unrelated, missing-asset or offline",
  );
const directory = await mkdtemp(join(tmpdir(), `irudd-codex-${mode}-`));
await mkdir(join(directory, ".agents/skills"), { recursive: true });
await cp(
  resolve("skills/irudd-plan"),
  join(directory, ".agents/skills/irudd-plan"),
  { recursive: true },
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 320, height: 160 } });
await page.setContent(fixtureSvg);
const visual = await page.screenshot();
await browser.close();
const running = await startTestServer();
let plan: Plan = tenItemPlan("trial-plan");
const asset = await running.service.uploadAsset("owner-a", {
  contractVersion: "v1",
  planId: plan.planId,
  assetId: "asset-contract",
  mediaType: "image/png",
  caption: "Required reference diagram",
  role: "binding-reference",
  bytesBase64: visual.toString("base64"),
});
plan = { ...plan, assets: [asset] };
plan = {
  ...plan,
  contexts: plan.contexts.map((context, index) =>
    index === 2
      ? {
          ...context,
          body: "Use a pure Python function and preserve the supplied name exactly.",
        }
      : context,
  ),
};
const selectedItem = {
  ...plan.items[0]!,
  goal: "Create greeting.py with a greet(name) function.",
  requirements: [
    "greet(name) returns 'Hello, ' followed by name and a period.",
  ],
  relevantPriorArt: [
    "Deliberately retrieve context-optional for the language decision.",
  ],
  checks: ["Run a Python assertion for greet('Ada')."],
  deferrals: [],
  acceptanceCriteria: [
    {
      id: "criterion-1",
      text: "The function returns the exact required greeting.",
    },
  ],
  completionExpectation:
    "Report the tested greeting and describe the inspected visual.",
};
plan = {
  ...plan,
  items: plan.items.map((item, index) => (index === 0 ? selectedItem : item)),
};
if (mode !== "planning")
  await running.service.write("owner-a", {
    operationId: "seed",
    expectedVersion: null,
    plan,
  });
else
  await writeFile(
    join(directory, "proposal.json"),
    JSON.stringify(plan, null, 2),
  );

const requests: Array<{
  method: string | string[] | undefined;
  tool: string | string[] | undefined;
  protocol: string | string[] | undefined;
}> = [];
running.server.on("request", (request) => {
  requests.push({
    method: request.headers["mcp-method"],
    tool: request.headers["mcp-name"],
    protocol: request.headers["mcp-protocol-version"],
  });
});
const getItem = running.service.getItem.bind(running.service);
let changed = false;
if (mode === "selected" || mode === "unrelated") {
  running.service.getItem = async (...args) => {
    const packet = await getItem(...args);
    if (!changed) {
      changed = true;
      const revised = {
        ...plan,
        items: plan.items.map((item, index) =>
          index === (mode === "selected" ? 0 : 1)
            ? {
                ...item,
                requirements:
                  mode === "selected"
                    ? [
                        "greet(name) returns 'Welcome, ' followed by name and a period.",
                      ]
                    : ["An unrelated sibling now needs an extra check."],
              }
            : item,
        ),
      };
      await running.service.write("owner-a", {
        operationId: "during-work",
        expectedVersion: 1,
        plan: revised,
      });
    }
    return packet;
  };
}
if (mode === "missing-asset")
  running.service.getAsset = async () => {
    throw new PlanError("ASSET_UNAVAILABLE", "Required bytes unavailable");
  };
if (mode === "offline") await running.close();

const prompt =
  mode === "planning"
    ? "Use $irudd-plan. Expected owner owner-a. Create trial-plan using proposal.json, which contains a ten-item proposal and an already uploaded visual descriptor. Then revise item-1 to require a Welcome greeting. We agree to that greeting requirement only. Inspect the required visual, retrieve item-1 and deliberately retrieve context-optional. Keep the plan private. Do not implement code or write GitHub. Report the observed revisions and the visual."
    : "Use $irudd-plan to implement irudd-plan://plans/trial-plan/items/item-1. Expected owner owner-a. The human link is http://127.0.0.1/plans/trial-plan/items/item-1. Work only in this temporary directory. Follow the packet requirements and report validation plus the final checked packet version. Do not write GitHub. Use only the installed public skill and configured MCP for plan requirements.";
const args = [
  "exec",
  "--ignore-user-config",
  "--skip-git-repo-check",
  "--ephemeral",
  "--json",
  "--sandbox",
  "workspace-write",
  "-c",
  "features.mcp_2026_07_28=true",
  "-c",
  "features.skip_host_skill_discovery=true",
  "-c",
  "project_doc_max_bytes=0",
  "-c",
  await isolatedSkillConfig(),
  "-c",
  `mcp_servers.irudd-plan.url=${JSON.stringify(`${running.url}/mcp`)}`,
  "-c",
  "mcp_servers.irudd-plan.required=true",
  "-c",
  'mcp_servers.irudd-plan.default_tools_approval_mode="approve"',
  "-c",
  "mcp_servers.irudd-plan.startup_timeout_sec=3",
  "-c",
  'mcp_servers.irudd-plan.env_http_headers={Authorization="IRUDD_TRIAL_ACCESS"}',
  "-o",
  join(directory, "result.txt"),
  prompt +
    " Do not read other skills or host guidance; this trial uses only the public irudd-plan skill in .agents/skills/irudd-plan.",
];
console.log(`Fresh Codex ${mode} trial: ${directory}`);
let transcript = "";
const exitCode = await new Promise<number | null>((resolveExit, reject) => {
  const child = spawn("codex", args, {
    cwd: directory,
    env: { ...process.env, IRUDD_TRIAL_ACCESS: "Bearer token-a" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk: Buffer) => {
    transcript += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    transcript += chunk.toString();
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 300_000);
  child.once("error", reject);
  child.once("close", (code) => {
    clearTimeout(timer);
    resolveExit(code);
  });
});
await writeFile(join(directory, "transcript.jsonl"), transcript);
await writeFile(
  join(directory, "requests.json"),
  JSON.stringify(requests, null, 2),
);
if (mode !== "offline") {
  const current = await running.service.current("owner-a", plan.planId);
  await writeFile(
    join(directory, "observed-plan.json"),
    JSON.stringify(current, null, 2),
  );
  await running.close();
}
console.log(
  `CLI exit ${exitCode}. Inspect result.txt, requests.json, observed-plan.json and generated code in ${directory}.`,
);
try {
  console.log(await readFile(join(directory, "result.txt"), "utf8"));
} catch {
  console.log("No final agent response was produced.");
}
if (exitCode !== 0 && mode !== "offline") process.exitCode = 1;
