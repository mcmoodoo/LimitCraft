// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@1inch/limit-order-protocol/interfaces/IAmountGetter.sol";
import "@1inch/limit-order-protocol/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import "@1inch/limit-order-protocol/libraries/ExtensionLib.sol";
import "./interfaces/chainlink/AggregatorV3Interface.sol";
import "./interfaces/IERC20.sol";

contract TwapCalculator is IAmountGetter {
    using AddressLib for Address;
    using ExtensionLib for bytes;
    
    error TwapMakingAmountExceedsAvailable();
    
     function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* takingAmount */,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view returns (uint256) {
        bytes calldata makingAmountData = extension.makingAmountData();
        (uint256 startTime, uint256 endTime) = abi.decode(makingAmountData[20:], (uint256, uint256));

        require(startTime > 0 && endTime > startTime, "Invalid time range");

        uint256 currentTime = block.timestamp;
        uint256 totalDuration = endTime - startTime;
        uint256 totalMakingAmount = order.makingAmount;
        
        uint256 availableAmount;
        if (currentTime < startTime) {
            // Before start time, no amount is available
            availableAmount = 0;
        } else if (currentTime >= endTime) {
            // After end time, full amount is available
            availableAmount = totalMakingAmount;
        } else {
            // During TWAP period, calculate proportional available amount
            uint256 timeElapsed = currentTime - startTime;
            availableAmount = (totalMakingAmount * timeElapsed) / totalDuration;
        }
        
        // Return the minimum of available amount and remaining amount
        return availableAmount > remainingMakingAmount ? remainingMakingAmount : availableAmount;
    }

    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension ,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external view virtual returns (uint256) {
        // Decode price feed address from extraData
        bytes calldata takingAmountData = extension.takingAmountData();
        address priceFeedAddress = abi.decode(takingAmountData[20:], (address));
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddress);
        
        // Get the latest price from Chainlink
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        
        // Ensure price is positive and data is recent (within 1 hour)
        require(price > 0, "Invalid price from oracle");
        require(block.timestamp - updatedAt <= 3600, "Price data too old");
        
        // Convert price to uint256 and handle decimals
        uint256 priceUSD = uint256(price);
        
        address makerAssetAddress = order.makerAsset.get();
        address takerAssetAddress = order.takerAsset.get();
        
        uint8 makerAssetDecimals = IERC20(makerAssetAddress).decimals();
        uint8 takerAssetDecimals = IERC20(takerAssetAddress).decimals();
        
        // Formula: takingAmount = (makingAmount * 10^(takerAssetDecimals + chainlinkDecimals)) / (priceUSD * 10^makerAssetDecimals)
        uint256 numerator = makingAmount * (10 ** (takerAssetDecimals + 8)); // 8 is Chainlink decimals
        uint256 denominator = priceUSD * (10 ** makerAssetDecimals);
        uint256 takingAmount = numerator / denominator;
        
        return takingAmount;
    }
    
    /**
     * @dev Get the latest ETH price from Chainlink
     * @return price The latest ETH price in USD (8 decimals)
     * @return updatedAt Timestamp of when the price was last updated
     */
    function getLatestPrice(address priceFeedAddress) external view virtual returns (uint256 price, uint256 updatedAt) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddress);
        (, int256 priceInt, , uint256 timestamp, ) = priceFeed.latestRoundData();
        require(priceInt > 0, "Invalid price from oracle");
        return (uint256(priceInt), timestamp);
    }
    
}