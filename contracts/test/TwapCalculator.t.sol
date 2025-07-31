// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/TwapCalculator.sol";
import "@1inch/limit-order-protocol/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

// Mock Chainlink price feed for testing
contract MockPriceFeed {
    int256 public price;
    uint256 public updatedAt;
    uint8 public decimals = 8;
    
    constructor(int256 _price) {
        price = _price;
        updatedAt = block.timestamp;
    }
    
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 timestamp,
        uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, updatedAt, 1);
    }
    
    function setPrice(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }
    
    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }
}

// Custom TwapCalculator for testing with mock price feed
contract TestTwapCalculator is TwapCalculator {
    MockPriceFeed public mockPriceFeed;
    
    constructor(address _priceFeed) {
        mockPriceFeed = MockPriceFeed(_priceFeed);
    }
    
    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view override returns (uint256) {
        // Get the latest ETH price from mock price feed
        (, int256 price, , uint256 updatedAt, ) = mockPriceFeed.latestRoundData();
        
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
    
    function getLatestETHPrice() external view returns (uint256 price, uint256 updatedAt) {
        (, int256 priceInt, , uint256 timestamp, ) = mockPriceFeed.latestRoundData();
        require(priceInt > 0, "Invalid price from oracle");
        return (uint256(priceInt), timestamp);
    }
}

contract TwapCalculatorTest is Test {
    using AddressLib for address;

    TwapCalculator public twapCalculator;
    TestTwapCalculator public testTwapCalculator;
    MockPriceFeed public mockPriceFeed;
    
    // Mock order data
    IOrderMixin.Order mockOrder;
    bytes mockExtension = "";
    bytes32 mockOrderHash = keccak256("test_order");
    address mockTaker = address(0x1234);
    address mockMaker = address(0x5678);
    address mockMakerAsset = address(0xA0B86a33e6411A3037e1ed40c0b8E8d2Ed68B96D); // USDC
    address mockTakerAsset = address(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1); // WETH
    uint256 mockMakingAmount = 1000e6; // 1000 USDC
    uint256 mockTakingAmount = 1e18; // 1 WETH
    uint256 mockRemainingMakingAmount = 500e6;
    bytes mockExtraData = abi.encode(uint256(123));

    function setUp() public {
        // Set up mock price feed with ETH price of $3000 (with 8 decimals)
        mockPriceFeed = new MockPriceFeed(300000000000); // $3000 * 1e8
        
        twapCalculator = new TwapCalculator();
        testTwapCalculator = new TestTwapCalculator(address(mockPriceFeed));
        
        // Initialize mock order
        mockOrder = IOrderMixin.Order({
            salt: 0,
            maker: Address.wrap(uint256(uint160(mockMaker))),
            receiver: Address.wrap(uint256(uint160(address(0)))),
            makerAsset: Address.wrap(uint256(uint160(mockMakerAsset))),
            takerAsset: Address.wrap(uint256(uint160(mockTakerAsset))),
            makingAmount: mockMakingAmount,
            takingAmount: mockTakingAmount,
            makerTraits: MakerTraits.wrap(0)
        });
    }

    function testGetMakingAmountReturnsZero() public view {
        uint256 result = twapCalculator.getMakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        assertEq(result, 0, "getMakingAmount should return 0 in current implementation");
    }

    function testGetTakingAmountWithChainlinkPrice() public view {
        uint256 result = testTwapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount, // 1000 USDC (1000 * 1e6)
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // With ETH at $3000, 1000 USDC should get approximately 0.333 ETH
        // Expected: (1000 * 1e6 * 1e20) / (3000 * 1e8) = 333333333333333333 (about 0.333 ETH)
        uint256 expected = (mockMakingAmount * 1e20) / 300000000000;
        assertEq(result, expected, "getTakingAmount should calculate based on ETH price");
    }

    function testGetMakingAmountWithDifferentInputs() public view {
        uint256 customTakingAmount = 0.5e18; // 0.5 WETH
        
        uint256 result = twapCalculator.getMakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            customTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        assertEq(result, 0, "getMakingAmount should return 0 regardless of input");
    }

    function testGetTakingAmountWithDifferentAmounts() public view {
        uint256 customMakingAmount = 500e6; // 500 USDC
        
        uint256 result = testTwapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            customMakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // With ETH at $3000, 500 USDC should get approximately 0.167 ETH
        uint256 expected = (customMakingAmount * 1e20) / 300000000000;
        assertEq(result, expected, "getTakingAmount should calculate correctly for different amounts");
    }

    function testGetMakingAmountWithZeroValues() public view {
        uint256 result = twapCalculator.getMakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            0, // Zero taking amount
            0, // Zero remaining making amount
            ""  // Empty extra data
        );
        
        assertEq(result, 0, "getMakingAmount should handle zero values");
    }

    function testGetTakingAmountWithZeroValues() public view {
        uint256 result = twapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            0, // Zero making amount
            0, // Zero remaining making amount
            ""  // Empty extra data
        );
        
        assertEq(result, 0, "getTakingAmount should handle zero values");
    }

    function testContractSupportsIAmountGetterInterface() public view {
        // Test that the contract properly implements IAmountGetter interface
        // by calling both functions without reverting
        twapCalculator.getMakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        twapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // If we reach here without reverting, the interface is properly implemented
        assertTrue(true, "Contract successfully implements IAmountGetter interface");
    }

    function testFuzzGetMakingAmount(
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash,
        address taker
    ) public view {
        // Bound inputs to reasonable ranges
        takingAmount = bound(takingAmount, 0, type(uint128).max);
        remainingMakingAmount = bound(remainingMakingAmount, 0, type(uint128).max);
        
        uint256 result = twapCalculator.getMakingAmount(
            mockOrder,
            mockExtension,
            orderHash,
            taker,
            takingAmount,
            remainingMakingAmount,
            mockExtraData
        );
        
        assertEq(result, 0, "getMakingAmount should always return 0");
    }

    function testFuzzGetTakingAmount(
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash,
        address taker
    ) public view {
        // Bound inputs to reasonable ranges
        makingAmount = bound(makingAmount, 0, type(uint128).max);
        remainingMakingAmount = bound(remainingMakingAmount, 0, type(uint128).max);
        
        uint256 result = twapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            orderHash,
            taker,
            makingAmount,
            remainingMakingAmount,
            mockExtraData
        );
        
        assertEq(result, 0, "getTakingAmount should always return 0");
    }

    function testGetMakingAmountWithLargeValues() public view {
        uint256 largeTakingAmount = type(uint256).max;
        uint256 largeRemainingAmount = type(uint256).max;
        
        uint256 result = twapCalculator.getMakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            largeTakingAmount,
            largeRemainingAmount,
            mockExtraData
        );
        
        assertEq(result, 0, "getMakingAmount should handle large values");
    }

    function testGetLatestETHPrice() public view {
        (uint256 price, uint256 updatedAt) = testTwapCalculator.getLatestETHPrice();
        
        assertEq(price, 300000000000, "Price should match mock price feed");
        assertGt(updatedAt, 0, "Updated timestamp should be greater than 0");
    }
    
    function testGetTakingAmountWithDifferentETHPrices() public {
        // Test with ETH at $2000
        mockPriceFeed.setPrice(200000000000); // $2000 * 1e8
        
        uint256 result = testTwapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount, // 1000 USDC
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // With ETH at $2000, 1000 USDC should get 0.5 ETH
        uint256 expected = (mockMakingAmount * 1e20) / 200000000000;
        assertEq(result, expected, "getTakingAmount should adjust with price changes");
        
        // Test with ETH at $4000
        mockPriceFeed.setPrice(400000000000); // $4000 * 1e8
        
        result = testTwapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // With ETH at $4000, 1000 USDC should get 0.25 ETH
        expected = (mockMakingAmount * 1e20) / 400000000000;
        assertEq(result, expected, "getTakingAmount should adjust with higher prices");
    }
    
    function testGetTakingAmountRevertsWithInvalidPrice() public {
        // Set negative price
        mockPriceFeed.setPrice(-100000000000);
        
        vm.expectRevert("Invalid price from oracle");
        testTwapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // Set zero price
        mockPriceFeed.setPrice(0);
        
        vm.expectRevert("Invalid price from oracle");
        testTwapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
    }
    
    function testGetTakingAmountRevertsWithStalePrice() public {
        // Set price data to be 2 hours old
        mockPriceFeed.setUpdatedAt(block.timestamp - 7200);
        
        vm.expectRevert("Price data too old");
        testTwapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
    }
    
    function testGetTakingAmountWithZeroMakingAmount() public view {
        uint256 result = testTwapCalculator.getTakingAmount(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            0, // Zero making amount
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        assertEq(result, 0, "getTakingAmount should return 0 for zero making amount");
    }
    
}