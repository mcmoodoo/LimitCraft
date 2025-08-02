// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/InteractionManager.sol";
import "../src/TwapCalculator.sol";
import "../src/interfaces/aaveV3/DataTypes.sol";
import "@1inch/limit-order-protocol/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import "@1inch/limit-order-protocol/libraries/MakerTraitsLib.sol";

// Mock contracts for testing
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function setAllowance(address owner, address spender, uint256 amount) external {
        allowance[owner][spender] = amount;
    }
}

contract MockAavePool {
    mapping(address => DataTypes.ReserveData) public reserves;
    mapping(address => mapping(address => uint256)) public userSupplies;
    
    function setReserveData(address asset, address aTokenAddress) external {
        reserves[asset] = DataTypes.ReserveData({
            configuration: DataTypes.ReserveConfigurationMap(0),
            liquidityIndex: 0,
            currentLiquidityRate: 0,
            variableBorrowIndex: 0,
            currentVariableBorrowRate: 0,
            currentStableBorrowRate: 0,
            lastUpdateTimestamp: 0,
            id: 0,
            aTokenAddress: aTokenAddress,
            stableDebtTokenAddress: address(0),
            variableDebtTokenAddress: address(0),
            interestRateStrategyAddress: address(0),
            accruedToTreasury: 0,
            unbacked: 0,
            isolationModeTotalDebt: 0
        });
    }
    
    function getReserveData(address asset) external view returns (DataTypes.ReserveData memory) {
        return reserves[asset];
    }
    
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        // Mock withdrawal - transfer tokens to the recipient
        MockERC20(asset).transfer(to, amount);
        return amount;
    }
    
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external {
        // Mock supply - record the supply
        userSupplies[onBehalfOf][asset] += amount;
    }
}

contract InteractionManagerTest is Test {
    using AddressLib for address;
    using MakerTraitsLib for MakerTraits;

    InteractionManager public interactionManager;
    TwapCalculator public twapCalculator;
    MockAavePool public mockAavePool;
    MockERC20 public mockUSDC;
    MockERC20 public mockWETH;
    MockERC20 public mockAUSDC;
    MockERC20 public mockAWETH;
    
    // Mock order data
    IOrderMixin.Order mockOrder;
    bytes mockExtension;
    bytes32 mockOrderHash = keccak256("test_order");
    address mockTaker = address(0x1234);
    address mockMaker = address(0x5678);
    uint256 mockMakingAmount = 1000e6; // 1000 USDC
    uint256 mockTakingAmount = 1e18; // 1 WETH
    uint256 mockRemainingMakingAmount = 500e6;
    bytes mockExtraData = abi.encode(uint256(123));

    function setUp() public {
        // Deploy mock contracts
        mockAavePool = new MockAavePool();
        mockUSDC = new MockERC20("USD Coin", "USDC");
        mockWETH = new MockERC20("Wrapped Ether", "WETH");
        mockAUSDC = new MockERC20("Aave USDC", "aUSDC");
        mockAWETH = new MockERC20("Aave WETH", "aWETH");
        
        // Deploy TwapCalculator
        twapCalculator = new TwapCalculator();
        
        // Deploy interaction manager with mock Aave pool and TwapCalculator
        interactionManager = new InteractionManager(address(mockAavePool), address(twapCalculator));
        
        // Set up Aave reserve data
        mockAavePool.setReserveData(address(mockUSDC), address(mockAUSDC));
        mockAavePool.setReserveData(address(mockWETH), address(mockAWETH));
        
        // Initialize mock order
        mockOrder = IOrderMixin.Order({
            salt: 0,
            maker: Address.wrap(uint256(uint160(mockMaker))),
            receiver: Address.wrap(uint256(uint160(address(0)))),
            makerAsset: Address.wrap(uint256(uint160(address(mockUSDC)))),
            takerAsset: Address.wrap(uint256(uint160(address(mockWETH)))),
            makingAmount: mockMakingAmount,
            takingAmount: mockTakingAmount,
            makerTraits: MakerTraits.wrap(0)
        });
        
        // Create extension with customData for InteractionManager
        bytes memory customData = abi.encode(
            InteractionManager.OrderType.REGULAR,
            InteractionManager.InteractionProtocol.AAVE
        );
        
        // Create minimal extension with only customData (at index 8)
        // All other fields are empty, so customData is the only field
        bytes32 offsets = bytes32(
            (uint256(0xFFFFFFFF) << 224) |  // offset0: makerAssetSuffix (empty)
            (uint256(0xFFFFFFFF) << 192) |  // offset1: takerAssetSuffix (empty)
            (uint256(0xFFFFFFFF) << 160) |  // offset2: makingAmountData (empty)
            (uint256(0xFFFFFFFF) << 128) |  // offset3: takingAmountData (empty)
            (uint256(0xFFFFFFFF) << 96) |   // offset4: predicate (empty)
            (uint256(0xFFFFFFFF) << 64) |   // offset5: permit (empty)
            (uint256(0xFFFFFFFF) << 32) |   // offset6: preInteraction (empty)
            uint256(0xFFFFFFFF)             // offset7: postInteraction (empty)
        );
        
        mockExtension = abi.encodePacked(
            offsets,
            customData  // customData is appended after the offsets
        );
        
        // Set up initial balances and approvals
        mockAUSDC.mint(mockMaker, mockMakingAmount);
        mockAUSDC.setAllowance(mockMaker, address(interactionManager), mockMakingAmount);
        
        mockWETH.mint(mockMaker, mockTakingAmount);
        mockWETH.setAllowance(mockMaker, address(interactionManager), mockTakingAmount);
        
        // Mint underlying tokens to Aave pool for withdrawals
        mockUSDC.mint(address(mockAavePool), mockMakingAmount);
        mockWETH.mint(address(mockAavePool), mockTakingAmount);
    }

    function testConstructor() public {
        assertEq(address(interactionManager.AAVE_POOL()), address(mockAavePool));
    }

    function testCopyArg() public {
        uint256 testValue = 12345;
        uint256 result = interactionManager.copyArg(testValue);
        assertEq(result, testValue, "copyArg should return the same value");
    }

    function testPreInteractionSuccess() public {
        // Check initial balances
        uint256 initialMakerUSDC = mockUSDC.balanceOf(mockMaker);
        uint256 initialMakerAUSDC = mockAUSDC.balanceOf(mockMaker);
        
        
        // Call preInteraction
        interactionManager.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // Check that aTokens were transferred from maker to contract
        assertEq(mockAUSDC.balanceOf(mockMaker), initialMakerAUSDC - mockMakingAmount);
        
        // Check that underlying tokens were transferred to maker
        assertEq(mockUSDC.balanceOf(mockMaker), initialMakerUSDC + mockMakingAmount);
    }

    function testPreInteractionUnsupportedAsset() public {
        // Create order with unsupported asset
        MockERC20 unsupportedToken = new MockERC20("Unsupported", "UNS");
        
        IOrderMixin.Order memory unsupportedOrder = mockOrder;
        unsupportedOrder.makerAsset = Address.wrap(uint256(uint160(address(unsupportedToken))));
        
        // Should revert with "Asset not supported by Aave"
        vm.expectRevert("Asset not supported by Aave");
        interactionManager.preInteraction(
            unsupportedOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
    }

    function testPostInteractionSuccess() public {
        // Check initial balances
        uint256 initialMakerWETH = mockWETH.balanceOf(mockMaker);
        uint256 initialContractWETH = mockWETH.balanceOf(address(interactionManager));
        
        // Expect the PostInteractionCalled event
        vm.expectEmit(true, true, true, true);
        emit InteractionManager.PostInteractionCalled(mockTakingAmount, mockExtraData);
        
        // Call postInteraction
        interactionManager.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // Check that tokens were transferred from maker to contract
        assertEq(mockWETH.balanceOf(mockMaker), initialMakerWETH - mockTakingAmount);
        assertEq(mockWETH.balanceOf(address(interactionManager)), initialContractWETH + mockTakingAmount);
        
        // Check that tokens were approved for Aave pool
        assertEq(mockWETH.allowance(address(interactionManager), address(mockAavePool)), mockTakingAmount);
    }

    function testFullOrderFlow() public {
        // Test complete flow: preInteraction -> postInteraction
        
        // Step 1: PreInteraction (withdraw USDC from Aave)
        uint256 initialMakerUSDC = mockUSDC.balanceOf(mockMaker);
        uint256 initialMakerAUSDC = mockAUSDC.balanceOf(mockMaker);
        
        interactionManager.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // Verify preInteraction results
        assertEq(mockAUSDC.balanceOf(mockMaker), initialMakerAUSDC - mockMakingAmount);
        assertEq(mockUSDC.balanceOf(mockMaker), initialMakerUSDC + mockMakingAmount);
        
        // Step 2: PostInteraction (supply WETH to Aave)
        uint256 initialMakerWETH = mockWETH.balanceOf(mockMaker);
        
        interactionManager.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // Verify postInteraction results
        assertEq(mockWETH.balanceOf(mockMaker), initialMakerWETH - mockTakingAmount);
        assertEq(mockWETH.allowance(address(interactionManager), address(mockAavePool)), mockTakingAmount);
    }

    function testPreInteractionWithDifferentAmounts() public {
        uint256 customAmount = 500e6; // 500 USDC
        
        // Set up balances for custom amount
        mockAUSDC.setAllowance(mockMaker, address(interactionManager), customAmount);
              
        interactionManager.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            customAmount, // Use custom making amount
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
    }

    function testPostInteractionWithDifferentAmounts() public {
        uint256 customTakingAmount = 0.5e18; // 0.5 WETH
        
        // Set up balances for custom amount
        mockWETH.setAllowance(mockMaker, address(interactionManager), customTakingAmount);
        
        vm.expectEmit(true, true, true, true);
        emit InteractionManager.PostInteractionCalled(customTakingAmount, mockExtraData);
        
        interactionManager.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            customTakingAmount, // Use custom taking amount
            mockRemainingMakingAmount,
            mockExtraData
        );
    }

    function testEventEmission() public {        
        interactionManager.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
        
        // Test PostInteractionCalled event
        vm.expectEmit(true, true, true, true);
        emit InteractionManager.PostInteractionCalled(mockTakingAmount, mockExtraData);
        
        interactionManager.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
    }

    function testPreInteractionInsufficientAllowance() public {
        // Set insufficient allowance
        mockAUSDC.setAllowance(mockMaker, address(interactionManager), mockMakingAmount - 1);
        
        // Should revert due to insufficient allowance
        vm.expectRevert();
        interactionManager.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
    }

    function testPostInteractionInsufficientAllowance() public {
        // Set insufficient allowance
        mockWETH.setAllowance(mockMaker, address(interactionManager), mockTakingAmount - 1);
        
        // Should revert due to insufficient allowance
        vm.expectRevert();
        interactionManager.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );
    }

    function testZeroAmounts() public {
                
        interactionManager.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            0, // Zero making amount
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );

        vm.expectEmit(true, true, true, true);
        emit InteractionManager.PostInteractionCalled(0, mockExtraData);
        
        interactionManager.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            0, // Zero taking amount
            mockRemainingMakingAmount,
            mockExtraData
        );
    }


} 