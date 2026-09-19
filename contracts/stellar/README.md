# Inlet on Stellar

The Stellar side of the deposit rail. One Soroban contract, `receiver`, is the mint recipient and the destination caller of the burn the hub makes on Arc toward CCTP domain 27. Anyone calls `receive_and_execute(message, attestation)`. In that one call the contract has Circle verify the attestation and mint the USDC into it, checks that the burn came from the hub on Arc and names this contract, reads the Inlet frame, and deposits for the beneficiary. If the deposit cannot complete, the USDC stays in the contract as claimable by the beneficiary. There is no second entry point that trusts a caller's bytes.

The beneficiary travels as 32 bytes, the raw ed25519 key of a G account. Amounts arrive with six decimals in the message and seven on Stellar, so the contract deposits the net amount times ten.

Adapters in version one: `noether-cross-margin:v1`, which calls `deposit_cross_margin_for(payer, beneficiary, amount)` on the Noether market. The market pulls the USDC from the receiver, so the receiver authorises exactly that one `transfer` for the call. Anything else in the frame becomes claimable.

`mock-market` carries the same entrypoint for testnet runs before the Noether stack on Circle's USDC exists.

## Build and test

```
cd contracts/stellar
cargo test
stellar contract build
```

Nine tests. The deposit test runs with no mocked authorisation, so it proves the nested transfer the way the network enforces it, and one test reads the message Circle attested for the first direct mint.

## Deploy

```
stellar contract deploy --wasm target/wasm32v1-none/release/inlet_stellar_receiver.wasm \
  --source <key> --network testnet -- \
  --admin <G address> --usdc CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA \
  --transmitter CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY \
  --hub_domain 26 --hub <hub address left padded to 32 bytes, hex> --market <market contract>
```

The admin can repoint the market with `set_market` and replace the code with `upgrade`. Nothing else is privileged.

## Recorded on testnet, 2026-09-19

| Run | Arc burn | Stellar transaction | Result |
| --- | --- | --- | --- |
| A bare contract as mint recipient and destination caller, 1 USDC, no forwarder | 0x980e5ec7d7ecd324ce7fcbf82902168114d25e22099f8ec2a6e12c030b7cb7dc | 9a254aa3f759aa2afc2ad0f73cf0f12b031f3085b860618e826bc438271a2ca3 | Circle minted 10000000 units into the contract, fee 0 |
| The receiver with the Inlet frame and a G account as beneficiary, 1 USDC, mock market | 0x7ec9205da613e18c6e989b88363017eca1ee3dc2229942d3bea544bf28f446a6 | acbf9444d93034fd134bda36d1947dee22eb65bbcc7b4e39b05981ff8d1f56d3 | minted, deposited and credited in one call sent by a key with no role, receiver left with 0 |

| The whole rail: 1 USDC burned on Base Sepolia, swept by the hub on Arc, deposited on Stellar for a separate trader account, 30 seconds from the burn | sweep 0xfa90f33af4955fae11ffa8b3e8b0741ca08b08c78e140bf458acfb99bdc56ca4 | 6e930736dc97daa096b45c9db8070cabfb53f5714f63cfa5d94efab48ce35484 | the trader's margin balance went from 0 to 9998700, the net of Circle's fast fee times ten |
| The whole rail into the Noether market itself: 1 USDC from Base Sepolia through the hosted Stellar relayer, 38 seconds from the burn | sweep 0xc41044a96b9a42ec99e5646384e3c300ba58130cba23dd0689f803d267a80eca | e1357193fb6b2d21786678bf0d5650cae1e714177a6a0b0f6f0e86f2826ca5bc | Noether's `cross_deposit_for` event with the trader as topic and the receiver and 9998700 as data; the trader's cross margin on Noether went from 0 to 9998700 |

In the first two runs the burning wallet stood in for the hub, against receiver `CAZ2VUUIJMVF5YAQ64NG2OUYSKCINRHB4363QKO7CI74YSHG6PRQQJYH`, so they prove the Stellar leg on its own. The third went through a hub: `0x91D9d762C8D813688dbaE38Effaa6BdaAA7E2E60` on Arc testnet, a second hub that serves Stellar only so the hub behind the live site stays untouched, with receiver `CASSQ246LZ44A6HGYHZYMSEHN3YUYPXFXMR4JF52P5HFYVJSIAMQYJDF` and mock market `CCR3QLSXZA2V65NJGCUY7XA5ZGXM4SVBEXWKER6IKXZSKIDKT2K4FAUO`. On 2026-09-20 `set_market` moved that receiver to Noether's market on its Circle USDC stack, `CAVX7KVU4ZMNN5WQX7DGMBSH4BUBJM7B3TZZQBXTXYAJU7PB4YNOQIJW`, and the fourth run went into it. Its source burn was 0x58288ee74136cbe854a48baa0737f545a5cba8b5eefe56b2557f844fa0e34c97 and the mint on Arc 0xabe789d28d2abc9f8c7da6a3409bc064226fb93bdb3a246354fd3af5ba310d0b.

The hub needs no Stellar specific code. Its direct kind already names the intent's receiver as mint recipient and destination caller and sends the plain frame, so Stellar is one `ConfigureHub` run with `DOMAIN=27 KIND=1` and the receiver's contract id as 32 bytes.
