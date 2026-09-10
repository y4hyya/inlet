// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IComet} from "../../src/interfaces/ICompoundV3.sol";

/// @notice Holds base balances and checks allowBySig the way Comet does, with its own EIP 712 domain.
contract MockComet is IComet {
    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant AUTHORIZATION_TYPEHASH = keccak256(
        "Authorization(address owner,address manager,bool isAllowed,uint256 nonce,uint256 expiry)"
    );

    string public constant name = "Compound USDC";
    string public constant version = "0";

    address public immutable baseToken;
    bool public supplyPaused;
    mapping(address account => uint256) public balanceOf;
    mapping(address account => uint256) public userNonce;
    mapping(address owner => mapping(address manager => bool)) public isAllowed;

    constructor(address baseToken_) {
        baseToken = baseToken_;
    }

    function pauseSupply(bool value) external {
        supplyPaused = value;
    }

    function supplyTo(address dst, address asset, uint256 amount) external {
        require(!supplyPaused, "paused");
        require(asset == baseToken, "not base");
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        balanceOf[dst] += amount;
    }

    function allowBySig(
        address owner,
        address manager,
        bool isAllowed_,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp < expiry, "SignatureExpired");
        require(nonce == userNonce[owner], "BadNonce");
        bytes32 domain = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                block.chainid,
                address(this)
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domain,
                keccak256(
                    abi.encode(AUTHORIZATION_TYPEHASH, owner, manager, isAllowed_, nonce, expiry)
                )
            )
        );
        require(ecrecover(digest, v, r, s) == owner, "BadSignatory");
        userNonce[owner]++;
        isAllowed[owner][manager] = isAllowed_;
    }

    function withdrawFrom(address src, address to, address asset, uint256 amount) external {
        require(asset == baseToken, "not base");
        require(src == msg.sender || isAllowed[src][msg.sender], "Unauthorized");
        require(balanceOf[src] >= amount, "insufficient");
        balanceOf[src] -= amount;
        IERC20(asset).transfer(to, amount);
    }
}
