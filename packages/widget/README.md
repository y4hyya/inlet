# @inletkit/widget

The React widget for Inlet. Deposit from any chain into a position, and withdraw a position back to native USDC on the chains the user chooses, each with one signature. It uses wagmi hooks for the wallet, so it drops into any app that already runs wagmi. Apps without a wallet stack can wrap it in `InletProvider`, which brings Privy and wagmi preconfigured for Base Sepolia, Arbitrum Sepolia, and Arc testnet.

```tsx
import { InletProvider, InletWidget, testnetDestinations } from "@inletkit/widget";
import "@inletkit/widget/styles.css";

<InletProvider privyAppId={PRIVY_APP_ID} relayerUrl={RELAYER_URL}>
  <InletWidget destinations={testnetDestinations} />
</InletProvider>
```

`InletWidget` puts both directions under one header with a Deposit and Withdraw toggle. `DepositWidget` and `ExitWidget` are the two halves on their own, for a host that only wants one of them.

Deposits pick Gateway when the user's unified balance covers the amount plus fee, which makes the deposit a single signature with no gas, and fall back to a CCTP fast transfer otherwise. Withdrawals list the positions the connected wallet holds, take an amount and one or more landing chains, and ask for one permit whose spender is an executor derived from the exit itself, so the signature can only produce the exit the user described.

A destination is withdrawable when it carries an `exit` entry. The testnet presets carry one for Aave V3, the Morpho vault and Compound III. A vault of your own that implements EIP 2612 needs nothing more than the InletExit on its chain:

```tsx
const vault = erc4626Destination({
  id: "my-vault",
  name: "My USDC Vault",
  destinationDomain: 6,
  receiver: "0x643AD7be131Aa7eE9fADB1596A66E69715F5a594",
  vault: "0xYourVaultOnBaseSepolia",
  exitContract: "0xfa6000e83B141bDA1aD067a5a5A32912f43F0258",
});
```
