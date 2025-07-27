// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@1inch/limit-order-protocol/interfaces/IOrderMixin.sol";
import "@1inch/limit-order-protocol/interfaces/IPreInteraction.sol";
import "@1inch/limit-order-protocol/interfaces/IPostInteraction.sol";

/**
 * @title LendingInteractionManager
 * @notice Manages pre and post interactions for limit orders with Aave v3 integration
 */

interface IAaveV3Pool {
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}

contract LendingInteractionManager is IPreInteraction, IPostInteraction {
    error InvalidExtraDataLength();
    error TakingAmountTooHigh();
    error IncorrectTakingAmount();
    error AaveWithdrawalFailed();

    // Events
    event AaveWithdrawal(address indexed asset, uint256 amount, address indexed to);
    event PostInteractionCalled(uint256 takingAmount, bytes extraData);

    // Aave v3 Pool address (this should be set to the correct address for the network)
    IAaveV3Pool public constant AAVE_POOL = IAaveV3Pool(0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2); // Mainnet address

    function copyArg(uint256 arg) external pure returns (uint256) {
        return arg;
    }

    function preInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
            address asset = address(0xaf88d065e77c8cC2239327C5EDb3A432268e5831);
            address maker = address(0x25AD56912553dF68EA0a6889fDC3BC109e7C7D74);

            try AAVE_POOL.withdraw(asset, makingAmount, maker) returns (uint256 withdrawnAmount) {
                // Withdrawal successful - emit event for tracking
                emit AaveWithdrawal(asset, withdrawnAmount, maker);
            } catch {
                revert AaveWithdrawalFailed();
            }
        
    }

    function postInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
        emit PostInteractionCalled(takingAmount, extraData);
    }
}
