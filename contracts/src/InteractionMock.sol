// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;

import "@1inch/limit-order-protocol/interfaces/IOrderMixin.sol";
import "@1inch/limit-order-protocol/interfaces/IPreInteraction.sol";
import "@1inch/limit-order-protocol/interfaces/IPostInteraction.sol";

contract InteractionMock is IPreInteraction, IPostInteraction {
    error InvalidExtraDataLength();
    error TakingAmountTooHigh();
    error IncorrectTakingAmount();

    // Events
    event PreInteractionCalled(uint256 makingAmount, bytes extraData);
    event PostInteractionCalled(uint256 takingAmount, bytes extraData);
    event DummyEvent(uint256 dummy);

    uint256 dummyNumber;

    function copyArg(uint256 arg) external pure returns (uint256) {
        return arg;
    }

    function preInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
        // if (extraData.length < 32) revert InvalidExtraDataLength();

        // uint256 targetAmount;
        // assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
        //     targetAmount := calldataload(extraData.offset)
        // }

        // if (takingAmount != targetAmount) revert IncorrectTakingAmount();
        emit PreInteractionCalled(makingAmount, extraData);
    }

    function dummy() external {
        dummyNumber = 44;
        emit DummyEvent(44);
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
        // if (extraData.length < 32) revert InvalidExtraDataLength();

        // uint256 threshold;
        // assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
        //     threshold := calldataload(extraData.offset)
        // }

        // if (takingAmount > threshold) revert TakingAmountTooHigh();

        // For testing: emit an event to confirm this function is called
        emit PostInteractionCalled(takingAmount, extraData);
    }
}
