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

## To be a destination

A protocol needs four things, all of them from the chain it lives on and from its own deposit call. The protocol changes nothing and grants nothing. The adapter does the work.

1. **A chain with a receiver.** Any chain with CCTP V2 and native USDC. Today that is Arbitrum Sepolia, Base Sepolia, Unichain Sepolia, Ethereum Sepolia and Monad Testnet. A new chain is a receiver deployment and a hub registration, not protocol work.
2. **Native USDC as the asset.** The receiver holds nothing else, so the deposit call has to take USDC itself, not a wrapped or bridged form.
3. **A deposit that credits a third party in one call.** The adapter is a contract acting for a user who never touches the destination chain, so the protocol needs an on behalf of parameter, or has to return a transferable token the adapter can forward. Aave's supply, Compound's supplyTo, an ERC 4626 deposit with a receiver and a Uniswap v4 mint to an owner all qualify.
4. **An outcome that is measurable right after the call.** Shares, an aToken balance delta, a token id with its liquidity. The adapter compares it with a minimum carried in the intent and reverts on a stale quote, and a revert falls back to claimable USDC.

An ERC 4626 vault over USDC meets all four with no contract work. Anything else is one adapter with one function, registered on the receiver.

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

## Exit adapters

The exit rail runs the same idea backwards. An exit adapter turns a position the owner holds into USDC held by a one shot executor, which then burns it through CCTP toward the chains the owner chose. It is a stateless contract with one function, and it runs by `delegatecall` inside the executor, so `address(this)` is the executor named as spender in the owner's signature:

```solidity
interface IInletExitAdapter {
    function redeem(address usdc, address owner, uint256 amount, uint64 deadline, bytes calldata data, bytes calldata signature)
        external
        returns (uint256 received);
}
```

`amount` is in position units. `signature` is the owner's 65 byte EIP 712 signature, a permit for EIP 2612 tokens or an `allowBySig` authorization for Compound. `received` is the USDC balance the executor gained, and the executor checks it against the intent's `minAssets`.

| Id | Contract | Adapter data | Signature |
| --- | --- | --- | --- |
| `erc4626-exit:v1` | `contracts/src/adapters/ERC4626ExitAdapter.sol` | `abi.encode(address vault)` | EIP 2612 permit on the vault shares |
| `aave-v3-exit:v1` | `contracts/src/adapters/AaveV3ExitAdapter.sol` | `abi.encode(address pool)` | EIP 2612 permit on the aToken read from the pool |
| `compound-v3-exit:v1` | `contracts/src/adapters/CompoundV3ExitAdapter.sol` | `abi.encode(address comet)` | `allowBySig` on the Comet, executor as manager |

### To be withdrawable

The bar is higher than for a deposit, because the owner signs once on any chain, pays no gas, and the executor has to finish in one call.

1. **A signature that names a spender.** The position token implements an EIP 2612 permit, or the protocol has its own signed authorization, like `allowBySig` on a Comet. The signature binds to the executor address derived from the intent, which is what makes one signature safe.
2. **A fungible amount.** aToken units, vault shares or base units the owner can put in the intent.
3. **A synchronous redemption.** One call from the executor's constructor yields the assets. A withdrawal queue, a cooldown or a request then claim flow, as in ERC 7540, does not fit.
4. **USDC as the only output.** The executor burns USDC toward each leg and can move nothing else.

Any ERC 4626 vault over USDC that implements EIP 2612 meets all four with the vault adapter and no contract work. Euler's EVK vault fails the first, since it authorizes through the EVC rather than a permit. A Uniswap v4 position fails the fourth. The PositionManager's permit can authorize the executor for a token id, but the position unwinds into ETH and USDC once the price has moved into the range. A v4 exit adapter would decrease the liquidity, swap the ETH side back to USDC inside the same call under a slippage floor in the intent, and then burn. Both stay deposit only for now.

Writing one: check the asset the same way the deposit adapters do, apply the signature with `address(this)` as the spender, pull the position, redeem it to `address(this)`, and return the balance difference. Register it on the `InletExit` of that chain with `setAdapter`. Deploy the rail itself with `script/DeployExit.s.sol` (`USDC`, `TOKEN_MESSENGER`).

## Deployed on testnet

| Chain | CCTP domain | Receiver | Adapters |
| --- | --- | --- | --- |
| Arbitrum Sepolia | 3 | 0x145083628c9dF6980fe2747B286835e7c637ed22 | ERC 4626 0x912c690f95a381e72F63a378fd906C6294412Fc9, Aave V3 0x9eD3b40bFd249Eb133Ae10b0006afae5d5947736 |
| Base Sepolia | 6 | 0x30695D945039FbBc0C36F595a8B5B54d83a945De | ERC 4626 0x6253A9a287803111eD736c0C234de17bBE7672ED, Compound III 0x77D23de84220E4Dc86b6B8c181Be1E49D6a23f7c |
| Unichain Sepolia | 10 | 0x49de71C101F1768C1ad4132AB815C163608A86d9 | ERC 4626 0x912c690f95a381e72F63a378fd906C6294412Fc9, Uniswap v4 0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED |
| Ethereum Sepolia | 0 | 0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED | ERC 4626 0x912c690f95a381e72F63a378fd906C6294412Fc9 |
| Monad Testnet | 15 | 0x38B9bCC43A585C80b7f649b9F98d394F9b321c96 | ERC 4626 0x912c690f95a381e72F63a378fd906C6294412Fc9 |

The exit rail is deployed where the three withdrawable positions live: InletExit 0xBBA8b8f139e27101812340fc750e39f096ECD677 on Arbitrum Sepolia with the exit adapters ERC 4626 0x643AD7be131Aa7eE9fADB1596A66E69715F5a594, Aave V3 0x6253A9a287803111eD736c0C234de17bBE7672ED and Compound III 0xeC0bBb2DA7a4c4f8F9c82bbf3AF7912d186D8001, and InletExit 0xfa6000e83B141bDA1aD067a5a5A32912f43F0258 on Base Sepolia with ERC 4626 0x145083628c9dF6980fe2747B286835e7c637ed22, Aave V3 0x5105e5af7a8C56d8fff2A1794aBC18e5ec31639B and Compound III 0xC7DA09Fc180062d0b31627686E7f7041E9288F90.

Protocol addresses the presets point at live in `config/protocols.testnet.json`: Aave V3 pool 0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff on Arbitrum Sepolia, Compound III USDC Comet 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017 and the Morpho Oneshot vault 0x405baeEC864f9fa12aB031e69F2a1aA2E4Add240 on Base Sepolia, and the Uniswap v4 PositionManager 0xf969Aee60879C54bAAed9F3eD26147Db216Fd664 with StateView 0xc199F1072a74D4e905ABa1A84d9a45E2546B6222 on Unichain Sepolia. Euler's `EVK Vault eUSDC-4` 0xF4FDA4026E5C012c96557E4f2412C566a8fcbd76 on Ethereum Sepolia is an ERC 4626 vault over Circle USDC reached through the generic adapter. Monad Testnet has no Gateway, so it is a CCTP only destination, and the Inlet demo vault 0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED over USDC 0x534b2f3A21130d7a60830c2Df862319e593943A3 sits there to deposit into.

A source and a destination on the same chain still route through Arc. That is by design: the hub is the single settlement point, the deposit address is the commitment, and every destination gets the same refund and claim guarantees.
