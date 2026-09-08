import { testnetDeployments } from "@inletkit/sdk";
import Link from "next/link";
import { Code } from "@/components/code";
import { RevealGroup } from "@/components/reveal";
import { tools } from "@/lib/content";
import { delay } from "@/lib/format";
import { links } from "@/lib/site";
import styles from "./integrate.module.css";

function snippet(domain: number, receiver: string, chain: string) {
  return `import { DepositWidget, erc4626Destination } from "@inletkit/widget";
import "@inletkit/widget/styles.css";

const vault = erc4626Destination({
  id: "my-vault",
  name: "My USDC Vault",
  destinationDomain: ${domain},
  receiver: "${receiver}",
  vault: "0xYourVaultOn${chain}",
});

<DepositWidget destinations={[vault]} relayerUrl={RELAYER_URL} />`;
}

const samples = [
  { id: "arbitrum", label: "Arbitrum", code: snippet(3, testnetDeployments.arbitrumSepolia.inletReceiver, "ArbitrumSepolia") },
  { id: "base", label: "Base", code: snippet(6, testnetDeployments.baseSepolia.inletReceiver, "BaseSepolia") },
];

export function Integrate() {
  return (
    <RevealGroup>
      <section className={`rail section ${styles.section}`} aria-labelledby="integrate-title" id="integrate">
        <div className={styles.grid}>
          <div className={styles.copy} data-reveal>
            <p className="eyebrow">Integrate</p>
            <h2 id="integrate-title" className={styles.title}>
              Three steps for a protocol. One tool call for an agent.
            </h2>
            <p className={styles.body}>
              An ERC 4626 vault over USDC needs no contract work at all. Anything else is one adapter with one function, and the widget mounts inside the wagmi provider a protocol already has.
            </p>
            <div className={styles.actions}>
              <Link className="btn btn-primary" href="/docs/widget">
                Mount the widget
              </Link>
              <Link className="btn btn-secondary" href="/docs/adapters">
                Write an adapter
              </Link>
            </div>
          </div>
          <div className={styles.sample} data-reveal style={delay(1)}>
            <Code samples={samples} />
            <p className={styles.caption}>
              The chain your user holds USDC on never appears here. You name where the position lives, and the rail brings the USDC from wherever they hold it.
            </p>
          </div>
        </div>

        <div className={styles.agents}>
          <div className={styles.agentsHead} data-reveal>
            <p className="eyebrow">For agents</p>
            <h3 className={styles.subtitle}>The same rail over MCP.</h3>
            <p className={styles.body}>
              A stdio server over the SDK and the relayer API the widget uses. An agent lists destinations, quotes, signs with its own wallet, and follows the deposit to the position.
            </p>
          </div>
          <ul className={styles.tools}>
            {tools.slice(0, 4).map((tool, position) => (
              <li key={tool.name} className={styles.tool} data-reveal style={delay(position)}>
                <code className={styles.toolName}>{tool.name}</code>
                <span className={styles.toolWhat}>{tool.what}</span>
              </li>
            ))}
          </ul>
          <p className={styles.more} data-reveal>
            Six more cover the source chains, the Gateway route, status and live pool prices. <Link href="/docs/agents">Set it up</Link> or read the{" "}
            <a href={links.skill} target="_blank" rel="noreferrer">
              skill file
            </a>{" "}
            a coding agent can follow.
          </p>
        </div>
      </section>
    </RevealGroup>
  );
}
