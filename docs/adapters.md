# Adapters

An adapter turns USDC that the Inlet receiver holds into a position for a beneficiary. It is a stateless contract with one function:

```solidity
interface IInletAdapter {
    function deposit(address usdc, uint256 amount, bytes32 beneficiary, bytes calldata data)
        external
        returns (bytes memory result);
}
```

The receiver approves the adapter for `amount`, calls `deposit`, and clears the approval. If the call reverts, the receiver credits the amount to the beneficiary's claimable balance instead, so a broken adapter can never lose funds. The `result` bytes are emitted in the `Executed` event and shown by the relayer; use them for share counts, token ids, or anything the front end wants to display.

`beneficiary` is a 32 byte value. On EVM chains it is the left padded address. `data` is adapter specific and travels inside the CCTP hook data from Arc, so keep it small.

## Writing one

1. Decode `data` into what the protocol call needs. Put anything the user should not be able to fake behind a check: the ERC 4626 adapter checks `vault.asset() == usdc`, the Compound adapter checks `comet.baseToken() == usdc`, the Aave adapter looks the aToken up from the pool instead of trusting the caller.
2. Pull the USDC with `safeTransferFrom(msg.sender, address(this), amount)`, approve the protocol, make the call with the beneficiary as the owner of whatever comes out.
3. Measure what the beneficiary received and compare it to a minimum carried in `data`, so a stale quote reverts instead of delivering less than promised. A revert here falls back to claimable USDC.
4. Return something useful in `result`.
5. Test it twice: with a mock of the protocol through `InletReceiver.receiveAndExecute`, and with a fork test against the real testnet contracts. The fork tests in `contracts/test/fork` skip when the RPC variable is unset, so they never break CI.
6. Deploy with `script/DeployAdapter.s.sol` (`NAME=<name> RECEIVER=<receiver>`), which also registers `keccak256("<name>:v1")` on the receiver. Add the address to `config/deployments.testnet.json` and a destination preset to `packages/widget/src/config.ts`.

Adapter ids are `keccak256` of a short name with a version, for example `erc4626:v1`. The SDK's `adapterId("erc4626:v1")` produces the same value as the contracts.

## Shipped adapters

| Id | Contract | Adapter data | Result | Checks |
| --- | --- | --- | --- | --- |
| `erc4626:v1` | `contracts/src/adapters/ERC4626Adapter.sol` | `abi.encode(address vault, uint256 minShares)` | `abi.encode(uint256 shares)` | `vault.asset() == usdc`, `shares >= minShares` |
| `aave-v3:v1` | `contracts/src/adapters/AaveV3Adapter.sol` | `abi.encode(address pool, uint256 minATokens)` | `abi.encode(address aToken, uint256 received)` | aToken read from `pool.getReserveData(usdc)`, aToken balance delta of the beneficiary |
| `compound-v3:v1` | `contracts/src/adapters/CompoundV3Adapter.sol` | `abi.encode(address comet, uint256 minSupplied)` | `abi.encode(address comet, uint256 gained)` | `comet.baseToken() == usdc`, `supplyTo(beneficiary, usdc, amount)`, balance delta |
| `uniswap-v4-lp:v1` | `contracts/src/adapters/UniswapV4LpAdapter.sol` | `abi.encode(PoolKey key, int24 rangeTicks, uint128 minLiquidity)` | `abi.encode(uint256 tokenId, uint128 liquidity, int24 tickLower, int24 tickUpper)` | USDC must be one side of the pool; a single sided range just outside the current tick on the USDC side; the position NFT is minted to the beneficiary |

The SDK has an encoder for each: `erc4626AdapterData`, `aaveV3AdapterData`, `compoundV3AdapterData`, `uniswapV4LpAdapterData`. The widget has a destination builder for each: `erc4626Destination`, `aaveV3Destination`, `compoundV3Destination`, `uniswapV4LpDestination`.

## Deployed on testnet

| Chain | CCTP domain | Receiver | Adapters |
| --- | --- | --- | --- |
| Arbitrum Sepolia | 3 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B | ERC 4626 0x912c690f95a381e72F63a378fd906C6294412Fc9, Aave V3 0x9eD3b40bFd249Eb133Ae10b0006afae5d5947736 |
| Base Sepolia | 6 | 0x643AD7be131Aa7eE9fADB1596A66E69715F5a594 | ERC 4626 0x6253A9a287803111eD736c0C234de17bBE7672ED, Compound III 0x77D23de84220E4Dc86b6B8c181Be1E49D6a23f7c |
| Unichain Sepolia | 10 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B | ERC 4626 0x912c690f95a381e72F63a378fd906C6294412Fc9, Uniswap v4 0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED |
| Ethereum Sepolia | 0 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B | ERC 4626 0x912c690f95a381e72F63a378fd906C6294412Fc9 |
| Monad Testnet | 15 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B | ERC 4626 0x912c690f95a381e72F63a378fd906C6294412Fc9 |

Protocol addresses the presets point at live in `config/protocols.testnet.json`: Aave V3 pool 0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff on Arbitrum Sepolia, Compound III USDC Comet 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017 and the Morpho Oneshot vault 0x405baeEC864f9fa12aB031e69F2a1aA2E4Add240 on Base Sepolia, and the Uniswap v4 PositionManager 0xf969Aee60879C54bAAed9F3eD26147Db216Fd664 with StateView 0xc199F1072a74D4e905ABa1A84d9a45E2546B6222 on Unichain Sepolia. Euler's `EVK Vault eUSDC-4` 0xF4FDA4026E5C012c96557E4f2412C566a8fcbd76 on Ethereum Sepolia is an ERC 4626 vault over Circle USDC reached through the generic adapter. Monad Testnet has no Gateway, so it is a CCTP only destination, and the Inlet demo vault 0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED over USDC 0x534b2f3A21130d7a60830c2Df862319e593943A3 sits there to deposit into.

A source and a destination on the same chain still route through Arc. That is by design: the hub is the single settlement point, the deposit address is the commitment, and every destination gets the same refund and claim guarantees.
