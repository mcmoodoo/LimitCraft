// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/InteractionMock.sol";
import "@1inch/limit-order-protocol/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import "@1inch/limit-order-protocol/libraries/MakerTraitsLib.sol";

contract InteractionMockTest is Test {
    using AddressLib for address;
    using MakerTraitsLib for MakerTraits;

    InteractionMock public interactionMock;
    
    // Mock order data for testing
    IOrderMixin.Order mockOrder;
    bytes mockExtension = "";
    bytes32 mockOrderHash = keccak256("test_order");
    address mockTaker = address(0x1234);
    uint256 mockMakingAmount = 1000;
    uint256 mockTakingAmount = 2000;
    uint256 mockRemainingMakingAmount = 500;
    bytes mockExtraData = abi.encode(uint256(123));

    function setUp() public {
        interactionMock = new InteractionMock();
        
        // Initialize mock order with valid data
        mockOrder = IOrderMixin.Order({
            salt: 0,
            maker: Address.wrap(uint256(uint160(address(0x5678)))),
            receiver: Address.wrap(uint256(uint160(address(0)))),
            makerAsset: Address.wrap(uint256(uint160(address(0x9999)))),
            takerAsset: Address.wrap(uint256(uint160(address(0x8888)))),
            makingAmount: mockMakingAmount,
            takingAmount: mockTakingAmount,
            makerTraits: MakerTraits.wrap(0)
        });
    }

    // Test copyArg function
    function testCopyArg() public {
        uint256 testValue = 12345;
        uint256 result = interactionMock.copyArg(testValue);
        assertEq(result, testValue, "copyArg should return the same value");
    }

    // Test that preInteraction is called and emits event
    function testPreInteractionCalled() public {
        // Expect the PreInteractionCalled event to be emitted
        vm.expectEmit(true, true, true, true);
        emit InteractionMock.PreInteractionCalled(mockMakingAmount, mockExtraData);
        
        // Call preInteraction
        interactionMock.preInteraction(
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

    // Test that postInteraction is called and emits event
    function testPostInteractionCalled() public {
        // Expect the PostInteractionCalled event to be emitted
        vm.expectEmit(true, true, true, true);
        emit InteractionMock.PostInteractionCalled(mockTakingAmount, mockExtraData);
        
        // Call postInteraction
        interactionMock.postInteraction(
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

    // Test both interactions are called in sequence
    function testBothInteractionsCalled() public {
        // Test preInteraction
        vm.expectEmit(true, true, true, true);
        emit InteractionMock.PreInteractionCalled(mockMakingAmount, mockExtraData);
        
        interactionMock.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            mockTakingAmount,
            mockRemainingMakingAmount,
            mockExtraData
        );

        // Test postInteraction
        vm.expectEmit(true, true, true, true);
        emit InteractionMock.PostInteractionCalled(mockTakingAmount, mockExtraData);
        
        interactionMock.postInteraction(
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
} 