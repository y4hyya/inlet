import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const out = join(here, "..", "src", "generated");
mkdirSync(out, { recursive: true });

const contracts = ["InletHub", "InletReceiver", "InletExit", "ERC4626Adapter", "AaveV3Adapter", "CompoundV3Adapter", "UniswapV4LpAdapter", "ERC4626ExitAdapter", "AaveV3ExitAdapter", "CompoundV3ExitAdapter", "DemoVault"];
let abi = "";
for (const name of contracts) {
  const artifact = JSON.parse(readFileSync(join(repo, "contracts", "out", `${name}.sol`, `${name}.json`), "utf8"));
  const exportName = name[0].toLowerCase() + name.slice(1) + "Abi";
  abi += `export const ${exportName} = ${JSON.stringify(artifact.abi, null, 2)} as const;\n\n`;
}
writeFileSync(join(out, "abi.ts"), abi);

const chains = readFileSync(join(repo, "config", "chains.testnet.json"), "utf8");
writeFileSync(join(out, "chains.ts"), `export const testnetChains = ${chains.trim()} as const;\n`);

const deployments = readFileSync(join(repo, "config", "deployments.testnet.json"), "utf8");
writeFileSync(join(out, "deployments.ts"), `export const testnetDeployments = ${deployments.trim()} as const;\n`);

const protocols = readFileSync(join(repo, "config", "protocols.testnet.json"), "utf8");
writeFileSync(join(out, "protocols.ts"), `export const testnetProtocols = ${protocols.trim()} as const;\n`);

console.log("generated abi, chains, deployments, protocols");
