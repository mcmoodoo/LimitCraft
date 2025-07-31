// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@1inch/limit-order-protocol/interfaces/IAmountGetter.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract TwapCalculator is IAmountGetter {
    using AddressLib for Address;
    // ETH/USD price feed on Arbitrum
    AggregatorV3Interface internal priceFeed;
    
    constructor() {
        // ETH/USD price feed address on Arbitrum mainnet
        priceFeed = AggregatorV3Interface(0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612);
    }
     function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        (
            uint256 startTime,
            uint256 endTime,
            uint256 numberOfOrders
        ) = abi.decode(extraData, (uint256, uint256, uint256));

        uint256 twapAmount = order.makingAmount / numberOfOrders;

        return twapAmount;

    }

    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        // Get the latest ETH price from Chainlink
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        
        // Ensure price is positive and data is recent (within 1 hour)
        require(price > 0, "Invalid price from oracle");
        require(block.timestamp - updatedAt <= 3600, "Price data too old");
        
        // Convert price to uint256 and handle decimals
        uint256 ethPriceUSD = uint256(price); // Price has 8 decimals from Chainlink
        
        // Calculate taking amount based on ETH price
        // Assuming makingAmount is in USDC (6 decimals) and we want WETH (18 decimals)
        // takingAmount = makingAmount * 1e18 / (ethPriceUSD * 1e2) 
        // The 1e2 adjusts for Chainlink's 8 decimals vs USDC's 6 decimals
        uint256 takingAmount = (makingAmount * 1e20) / ethPriceUSD;
        
        return takingAmount;
    }
    
    /**
     * @dev Get the latest ETH price from Chainlink
     * @return price The latest ETH price in USD (8 decimals)
     * @return updatedAt Timestamp of when the price was last updated
     */
    function getLatestETHPrice() external view returns (uint256 price, uint256 updatedAt) {
        (, int256 priceInt, , uint256 timestamp, ) = priceFeed.latestRoundData();
        require(priceInt > 0, "Invalid price from oracle");
        return (uint256(priceInt), timestamp);
    }
    
}