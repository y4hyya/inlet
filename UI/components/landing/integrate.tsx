import Link from "next/link";
import { Code } from "@/components/code";
import { RevealGroup } from "@/components/reveal";
import { tools } from "@/lib/content";
import { delay } from "@/lib/format";
import { links } from "@/lib/site";
import styles from "./integrate.module.css";

const snippet = `import {
  InletProvider,
  DepositWidget,
  erc4626Destination,
} from "@inletkit/widget";
import "@inletkit/widget/styles.css";

const vault = erc4626Destination({
  id: "my-vault",
  name: "My USDC Vault",
  destinationDomain: 6,
  receiver: "0x643AD7be131Aa7eE9fADB1596A66E69715F5a594",
  vault: "0xYourVaultOnBaseSepolia",
});

<InletProvider privyAppId={PRIVY_APP_ID} relayerUrl={RELAYER_URL}>
  <DepositWidget destinations={[vault]} />
</InletProvider>`;

export function Integrate() {
  return (
    <RevealGroup>
      <section className={`rail section ${styles.section}`} aria-labelledby="integrate-title" id="integrate">
        <div className={styles.grid}>
          <div className={styles.copy} data-reveal>
            <p className="eyebrow">Integrate</p>
            <h2 id="integrate-title" className={styles.title}>
              Three lines for a protocol. One tool call for an agent.
            </h2>
            <p className={styles.body}>
              Any ERC 4626 vault over USDC on a chain with a receiver needs no contract work. Anything else needs one adapter with one function. The widget is wallet agnostic and runs on wagmi, so it drops into the stack a protocol already has. The relayer is open source and anyone can run one against the same hub.
            </p>
            <div className={styles.actions}>
              <Link className="btn btn-secondary" href="/docs/widget">
                Mount the widget
              </Link>
              <Link className="btn btn-secondary" href="/docs/adapters">
                Write an adapter
              </Link>
            </div>
          </div>
          <div data-reveal style={delay(1)}>
            <Code code={snippet} label="app.tsx" />
          </div>
        </div>

        <div className={styles.agents}>
          <div className={styles.copy} data-reveal>
            <p className="eyebrow">For agents</p>
            <h3 className={styles.subtitle}>The same rail over MCP.</h3>
            <p className={styles.body}>
              A stdio server over the SDK and the relayer API the widget uses. An agent lists destinations, quotes, creates the intent, signs, and follows the deposit to the position. With a funded key it does the whole thing in one call.
            </p>
            <p className={styles.body}>
              <Link href="/docs/agents">Set it up</Link> or read the{" "}
              <a href={links.skill} target="_blank" rel="noreferrer">
                skill file
              </a>{" "}
              a coding agent can follow.
            </p>
          </div>
          <ul className={styles.tools}>
            {tools.map((tool, index) => (
              <li key={tool.name} className={styles.tool} data-reveal style={delay(index % 5)}>
                <code className={styles.toolName}>{tool.name}</code>
                <span className={styles.toolWhat}>{tool.what}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </RevealGroup>
  );
}
