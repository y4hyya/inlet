// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice One leg of an exit: USDC minted to a recipient on a CCTP domain.
struct ExitLeg {
    uint32 domain;
    bytes32 recipient;
    uint256 amount;
}

/// @notice One exit from a position on this chain into USDC on one or more chains.
struct ExitIntent {
    address owner;
    bytes32 adapterId;
    bytes adapterData;
    uint256 amount;
    uint256 minAssets;
    ExitLeg[] legs;
    uint256 nonce;
    uint64 deadline;
    uint16 maxFeeBps;
}

library ExitTypes {
    bytes32 internal constant LEG_TYPEHASH =
        keccak256("ExitLeg(uint32 domain,bytes32 recipient,uint256 amount)");

    bytes32 internal constant EXIT_TYPEHASH = keccak256(
        "ExitIntent(address owner,bytes32 adapterId,bytes adapterData,uint256 amount,uint256 minAssets,ExitLeg[] legs,uint256 nonce,uint64 deadline,uint16 maxFeeBps)ExitLeg(uint32 domain,bytes32 recipient,uint256 amount)"
    );

    uint32 internal constant FAST_FINALITY = 1000;

    error BadSignatureLength(uint256 length);

    function structHash(ExitIntent memory intent) internal pure returns (bytes32) {
        bytes32[] memory legs = new bytes32[](intent.legs.length);
        for (uint256 i = 0; i < legs.length; i++) {
            ExitLeg memory leg = intent.legs[i];
            legs[i] = keccak256(abi.encode(LEG_TYPEHASH, leg.domain, leg.recipient, leg.amount));
        }
        return keccak256(
            abi.encode(
                EXIT_TYPEHASH,
                intent.owner,
                intent.adapterId,
                keccak256(intent.adapterData),
                intent.amount,
                intent.minAssets,
                keccak256(abi.encodePacked(legs)),
                intent.nonce,
                intent.deadline,
                intent.maxFeeBps
            )
        );
    }

    function split(bytes memory signature) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        if (signature.length != 65) revert BadSignatureLength(signature.length);
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
    }
}
