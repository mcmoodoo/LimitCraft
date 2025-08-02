// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;
import {IPoolV3} from "./interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {DataTypes} from "./interfaces/aaveV3/DataTypes.sol";
import {IAaveProtocolDataProvider} from "./interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import "@1inch/limit-order-protocol/interfaces/IOrderMixin.sol";
import "@1inch/limit-order-protocol/interfaces/IPreInteraction.sol";
import "@1inch/limit-order-protocol/interfaces/IPostInteraction.sol";
import "@1inch/limit-order-protocol/libraries/ExtensionLib.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import "./TwapCalculator.sol";


/**
 * @title InteractionManager
 * @notice Manages pre and post interactions for limit orders with Aave v3 integration
 */

contract InteractionManager is IPreInteraction, IPostInteraction {
    using AddressLib for Address;
    using ExtensionLib for bytes;

    enum InteractionProtocol {
        NONE,
        AAVE
    }

    enum OrderType {
        REGULAR,
        TWAP
    }

    error InvalidExtraDataLength();
    error TakingAmountTooHigh();
    error IncorrectTakingAmount();
    error TwapMakingAmountExceedsAvailable();

    event PreInteractionCalled(uint256 makingAmount, bytes extension); 
    event PostInteractionCalled(uint256 takingAmount, bytes extension);
    
    IPoolV3 public immutable AAVE_POOL;
    TwapCalculator public immutable TWAP_CALCULATOR;

    constructor(address _aavePool, address _twapCalculator) {
        AAVE_POOL = IPoolV3(_aavePool);
        TWAP_CALCULATOR = TwapCalculator(_twapCalculator);
    }

    function copyArg(uint256 arg) external pure returns (uint256) {
        return arg;
    }

    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* takingAmount */,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external {
        (OrderType orderType, InteractionProtocol protocol) = abi.decode(extraData, (OrderType, InteractionProtocol));

        // TWAP validation using TwapCalculator
        if (orderType == OrderType.TWAP) {
            uint256 availableMakingAmount = TWAP_CALCULATOR.getMakingAmount(
                order,
                extension,
                bytes32(0), 
                address(0),
                0,
                remainingMakingAmount,
                ""
            );
            
            if (makingAmount > availableMakingAmount) {
                revert TwapMakingAmountExceedsAvailable();
            }
        }

        
        if (protocol == InteractionProtocol.AAVE) {
            DataTypes.ReserveData memory reserveData = AAVE_POOL.getReserveData(order.makerAsset.get());
            require(reserveData.aTokenAddress != address(0), "Asset not supported by Aave");
            IERC20(reserveData.aTokenAddress).transferFrom(order.maker.get(), address(this), makingAmount);
            AAVE_POOL.withdraw(order.makerAsset.get(), makingAmount, order.maker.get());
        }
             
        emit PreInteractionCalled(makingAmount, extension);
    }

    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
        (OrderType orderType, InteractionProtocol protocol) = abi.decode(extraData, (OrderType, InteractionProtocol));

        if (protocol == InteractionProtocol.AAVE) {
            IERC20(order.takerAsset.get()).transferFrom(order.maker.get(), address(this), takingAmount);
            IERC20(order.takerAsset.get()).approve(address(AAVE_POOL), takingAmount);
            AAVE_POOL.supply(order.takerAsset.get(), takingAmount, order.maker.get(), 0);
        }

        emit PostInteractionCalled(takingAmount, extension);
    }
}
