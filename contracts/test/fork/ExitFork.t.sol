// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {InletExit} from "../../src/InletExit.sol";
import {AaveV3ExitAdapter} from "../../src/adapters/AaveV3ExitAdapter.sol";
import {CompoundV3ExitAdapter} from "../../src/adapters/CompoundV3ExitAdapter.sol";
import {ERC4626ExitAdapter} from "../../src/adapters/ERC4626ExitAdapter.sol";
import {IAaveV3Pool} from "../../src/interfaces/IAaveV3.sol";
import {IComet} from "../../src/interfaces/ICompoundV3.sol";
import {ExitIntent, ExitLeg} from "../../src/libraries/ExitTypes.sol";
import {CctpMessages} from "../CctpMessages.sol";

interface ICometDomain {
    function name() external view returns (string memory);

    function version() external view returns (string memory);
}

/// @notice Runs the exit rail against the live testnets when the RPC variables are set, otherwise skips.
contract ExitForkTest is Test {
    bytes32 constant ERC4626_EXIT_ID = keccak256("erc4626-exit:v1");
    bytes32 constant AAVE_EXIT_ID = keccak256("aave-v3-exit:v1");
    bytes32 constant COMPOUND_EXIT_ID = keccak256("compound-v3-exit:v1");
    bytes32 constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    bytes32 constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 constant AUTHORIZATION_TYPEHASH = keccak256(
        "Authorization(address owner,address manager,bool isAllowed,uint256 nonce,uint256 expiry)"
    );

    address constant TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address constant ARBITRUM_USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;
    address constant AAVE_POOL = 0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff;
    address constant BASE_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant MORPHO_VAULT = 0x405baEeC864F9FA12AB031e69f2a1Aa2e4Add240;
    address constant COMET = 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017;

    uint32 constant ETHEREUM_SEPOLIA = 0;
    uint32 constant ARBITRUM_SEPOLIA = 3;
    uint32 constant BASE_SEPOLIA = 6;

    uint256 ownerKey = 0xE7117;
    address owner;

    function setUp() public {
        owner = vm.addr(ownerKey);
    }

    function _deploy(address usdc, bytes32 adapterId, address adapter)
        internal
        returns (InletExit exit)
    {
        exit = new InletExit(usdc, TOKEN_MESSENGER, address(this));
        exit.setAdapter(adapterId, adapter);
    }

    function _intent(
        bytes32 adapterId,
        address target,
        uint256 amount,
        uint256 minAssets,
        uint32 domain,
        uint256 fixedAmount
    ) internal view returns (ExitIntent memory) {
        ExitLeg[] memory legs = new ExitLeg[](2);
        legs[0] = ExitLeg({
            domain: domain, recipient: CctpMessages.toBytes32(owner), amount: fixedAmount
        });
        legs[1] = ExitLeg({
            domain: ETHEREUM_SEPOLIA, recipient: CctpMessages.toBytes32(owner), amount: 0
        });
        return ExitIntent({
            owner: owner,
            adapterId: adapterId,
            adapterData: abi.encode(target),
            amount: amount,
            minAssets: minAssets,
            legs: legs,
            nonce: 1,
            deadline: uint64(block.timestamp + 1 hours),
            maxFeeBps: 3
        });
    }

    function _permit(address token, address spender, uint256 value, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                IERC20Permit(token).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        PERMIT_TYPEHASH,
                        owner,
                        spender,
                        value,
                        IERC20Permit(token).nonces(owner),
                        deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _authorization(address comet, address manager, uint64 expiry)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(ICometDomain(comet).name())),
                keccak256(bytes(ICometDomain(comet).version())),
                block.chainid,
                comet
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domain,
                keccak256(
                    abi.encode(
                        AUTHORIZATION_TYPEHASH,
                        owner,
                        manager,
                        true,
                        IComet(comet).userNonce(owner),
                        uint256(expiry)
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_aaveExitOnArbitrumSepolia() public {
        string memory rpc = vm.envOr("ARBITRUM_SEPOLIA_RPC", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc);

        InletExit exit = _deploy(ARBITRUM_USDC, AAVE_EXIT_ID, address(new AaveV3ExitAdapter()));
        deal(ARBITRUM_USDC, owner, 10e6);
        vm.startPrank(owner);
        IERC20(ARBITRUM_USDC).approve(AAVE_POOL, 10e6);
        IAaveV3Pool(AAVE_POOL).supply(ARBITRUM_USDC, 10e6, owner, 0);
        vm.stopPrank();

        address aToken = IAaveV3Pool(AAVE_POOL).getReserveData(ARBITRUM_USDC).aTokenAddress;
        uint256 position = IERC20(aToken).balanceOf(owner);
        ExitIntent memory intent =
            _intent(AAVE_EXIT_ID, AAVE_POOL, position, 10e6 - 2, BASE_SEPOLIA, 4e6);
        address executor = exit.exitAddress(exit.hashExit(intent));
        bytes memory signature = _permit(aToken, executor, position, intent.deadline);

        uint256 supplyBefore = IERC20(ARBITRUM_USDC).totalSupply();
        uint256 received = exit.execute(intent, signature);

        assertGe(received, 10e6 - 2);
        assertApproxEqAbs(IERC20(aToken).balanceOf(owner), 0, 2);
        assertEq(IERC20(ARBITRUM_USDC).balanceOf(executor), 0);
        assertEq(supplyBefore - IERC20(ARBITRUM_USDC).totalSupply(), received);
    }

    function test_morphoExitOnBaseSepolia() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc);

        InletExit exit = _deploy(BASE_USDC, ERC4626_EXIT_ID, address(new ERC4626ExitAdapter()));
        deal(BASE_USDC, owner, 10e6);
        vm.startPrank(owner);
        IERC20(BASE_USDC).approve(MORPHO_VAULT, 10e6);
        IERC4626(MORPHO_VAULT).deposit(10e6, owner);
        vm.stopPrank();

        uint256 shares = IERC20(MORPHO_VAULT).balanceOf(owner);
        assertGe(shares, IERC4626(MORPHO_VAULT).previewWithdraw(10e6 - 1e4));
        ExitIntent memory intent =
            _intent(ERC4626_EXIT_ID, MORPHO_VAULT, shares, 10e6 - 1e4, ARBITRUM_SEPOLIA, 4e6);
        address executor = exit.exitAddress(exit.hashExit(intent));
        bytes memory signature = _permit(MORPHO_VAULT, executor, shares, intent.deadline);

        uint256 supplyBefore = IERC20(BASE_USDC).totalSupply();
        uint256 received = exit.execute(intent, signature);

        assertGe(received, 10e6 - 1e4);
        assertEq(IERC20(MORPHO_VAULT).balanceOf(owner), 0);
        assertEq(IERC20(BASE_USDC).balanceOf(executor), 0);
        assertEq(supplyBefore - IERC20(BASE_USDC).totalSupply(), received);
    }

    function test_compoundExitOnBaseSepolia() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc);

        InletExit exit = _deploy(BASE_USDC, COMPOUND_EXIT_ID, address(new CompoundV3ExitAdapter()));
        deal(BASE_USDC, owner, 10e6);
        vm.startPrank(owner);
        IERC20(BASE_USDC).approve(COMET, 10e6);
        IComet(COMET).supplyTo(owner, BASE_USDC, 10e6);
        vm.stopPrank();

        uint256 position = IComet(COMET).balanceOf(owner);
        ExitIntent memory intent =
            _intent(COMPOUND_EXIT_ID, COMET, position, 10e6 - 2, ARBITRUM_SEPOLIA, 4e6);
        address executor = exit.exitAddress(exit.hashExit(intent));
        bytes memory signature = _authorization(COMET, executor, intent.deadline);

        uint256 supplyBefore = IERC20(BASE_USDC).totalSupply();
        uint256 received = exit.execute(intent, signature);

        assertGe(received, 10e6 - 2);
        assertApproxEqAbs(IComet(COMET).balanceOf(owner), 0, 2);
        assertEq(IERC20(BASE_USDC).balanceOf(executor), 0);
        assertEq(supplyBefore - IERC20(BASE_USDC).totalSupply(), received);
    }
}
