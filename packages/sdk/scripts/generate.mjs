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

const networks = ["testnet", "mainnet"];
for (const file of ["chains", "deployments", "protocols"]) {
  let source = "";
  for (const network of networks) {
    const json = readFileSync(join(repo, "config", `${file}.${network}.json`), "utf8");
    source += `export const ${network}${file[0].toUpperCase()}${file.slice(1)} = ${json.trim()} as const;\n\n`;
  }
  writeFileSync(join(out, `${file}.ts`), source.trimEnd() + "\n");
}

console.log("generated abi, chains, deployments, protocols for testnet and mainnet");
