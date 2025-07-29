// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;
import {IPoolV3} from "./interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {DataTypes} from "./interfaces/aaveV3/DataTypes.sol";
import {IAaveProtocolDataProvider} from "./interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import "@1inch/limit-order-protocol/interfaces/IOrderMixin.sol";
import "@1inch/limit-order-protocol/interfaces/IPreInteraction.sol";
import "@1inch/limit-order-protocol/interfaces/IPostInteraction.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

/**
 * @title LendingInteractionManager
 * @notice Manages pre and post interactions for limit orders with Aave v3 integration
 */

contract LendingInteractionManager is IPreInteraction, IPostInteraction {
    using AddressLib for Address;

    error InvalidExtraDataLength();
    error TakingAmountTooHigh();
    error IncorrectTakingAmount();

    event PreInteractionCalled(uint256 makingAmount, bytes extraData); 
    event PostInteractionCalled(uint256 takingAmount, bytes extraData);
    
    IPoolV3 public immutable AAVE_POOL;

    constructor(address _aavePool) {
        AAVE_POOL = IPoolV3(_aavePool);
    }

    function copyArg(uint256 arg) external pure returns (uint256) {
        return arg;
    }

    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
        DataTypes.ReserveData memory reserveData = AAVE_POOL.getReserveData(order.makerAsset.get());
        require(reserveData.aTokenAddress != address(0), "Asset not supported by Aave");
        IERC20(reserveData.aTokenAddress).transferFrom(order.maker.get(), address(this), makingAmount);
        AAVE_POOL.withdraw(order.makerAsset.get(), makingAmount, order.maker.get());
             
        emit PreInteractionCalled(makingAmount, extraData);
    }

    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
        IERC20(order.takerAsset.get()).transferFrom(order.maker.get(), address(this), takingAmount);
        IERC20(order.takerAsset.get()).approve(address(AAVE_POOL), takingAmount);
        AAVE_POOL.supply(order.takerAsset.get(), takingAmount, order.maker.get(), 0);

        emit PostInteractionCalled(takingAmount, extraData);
    }
}
