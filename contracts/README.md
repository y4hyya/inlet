# Inlet contracts

Foundry project. `src/InletHub.sol` is the hub on Arc, `src/InletReceiver.sol` the receiver on EVM destinations, `src/adapters/ERC4626Adapter.sol` the generic vault adapter, and `src/InletForwarder.sol` the contract that lives at a deposit address. `src/InletExit.sol` is the exit rail on each destination chain, `src/InletExitExecutor.sol` the one shot contract that lives at an exit address, and `src/adapters/*ExitAdapter.sol` the three exit adapters it delegatecalls.

```
forge build
forge test
```

Deployment scripts live in `script/`. Copy `.env.example` to `.env` and set `PRIVATE_KEY` before broadcasting. Chain addresses for the testnet demo are in `../config/chains.testnet.json`.

## Script environment

| Script | Variables |
| --- | --- |
| DeployHub | PRIVATE_KEY, optional USDC, TOKEN_MESSENGER, LOCAL_DOMAIN, OWNER |
| DeployReceiver | PRIVATE_KEY, USDC, MESSAGE_TRANSMITTER, HUB, optional HUB_DOMAIN, OWNER, DEPLOY_DEMO_VAULT |
| ConfigureHub | PRIVATE_KEY, HUB, DOMAIN, KIND (1 evm, 2 stellar forwarder), RECEIVER, optional FORWARDER, STRKEY, MAX_FEE_BPS |
| DeployExit | PRIVATE_KEY, USDC, TOKEN_MESSENGER, optional OWNER |
