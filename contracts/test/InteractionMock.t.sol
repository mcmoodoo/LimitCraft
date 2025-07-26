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
    uint256 mockRemainingMakingAmount = 500;

    function setUp() public {
        interactionMock = new InteractionMock();
        
        // Initialize mock order with valid data
        mockOrder = IOrderMixin.Order({
            salt: 0,
            maker: Address.wrap(uint256(uint160(address(0x5678)))),
            receiver: Address.wrap(uint256(uint160(address(0)))),
            makerAsset: Address.wrap(uint256(uint160(address(0x9999)))),
            takerAsset: Address.wrap(uint256(uint160(address(0x8888)))),
            makingAmount: 1000,
            takingAmount: 2000,
            makerTraits: MakerTraits.wrap(0)
        });
    }

    // Test copyArg function
    function testCopyArg() public {
        uint256 testValue = 12345;
        uint256 result = interactionMock.copyArg(testValue);
        assertEq(result, testValue, "copyArg should return the same value");
    }

    function testCopyArgFuzz(uint256 value) public {
        uint256 result = interactionMock.copyArg(value);
        assertEq(result, value, "copyArg should return the same value for any input");
    }

    // Test preInteraction with valid data
    function testPreInteractionSuccess() public {
        uint256 takingAmount = 1500;
        uint256 targetAmount = 1500;
        
        // Encode target amount in extraData (first 32 bytes)
        bytes memory extraData = abi.encode(targetAmount);
        
        // Should not revert when takingAmount equals targetAmount
        interactionMock.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
    }

    // Test preInteraction with invalid extra data length
    function testPreInteractionInvalidExtraDataLength() public {
        uint256 takingAmount = 1500;
        bytes memory extraData = abi.encodePacked(uint8(123)); // Less than 32 bytes
        
        vm.expectRevert(InteractionMock.InvalidExtraDataLength.selector);
        interactionMock.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
    }

    // Test preInteraction with incorrect taking amount
    function testPreInteractionIncorrectTakingAmount() public {
        uint256 takingAmount = 1500;
        uint256 targetAmount = 2000; // Different from takingAmount
        
        bytes memory extraData = abi.encode(targetAmount);
        
        vm.expectRevert(InteractionMock.IncorrectTakingAmount.selector);
        interactionMock.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
    }

    // Test postInteraction with valid data (below threshold)
    function testPostInteractionSuccess() public {
        uint256 takingAmount = 1500;
        uint256 threshold = 2000; // Higher than takingAmount
        
        bytes memory extraData = abi.encode(threshold);
        
        // Should not revert when takingAmount is below threshold
        interactionMock.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
    }

    // Test postInteraction with taking amount equal to threshold
    function testPostInteractionEqualThreshold() public {
        uint256 takingAmount = 2000;
        uint256 threshold = 2000; // Equal to takingAmount
        
        bytes memory extraData = abi.encode(threshold);
        
        // Should not revert when takingAmount equals threshold
        interactionMock.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
    }

    // Test postInteraction with invalid extra data length
    function testPostInteractionInvalidExtraDataLength() public {
        uint256 takingAmount = 1500;
        bytes memory extraData = new bytes(20); // Less than 32 bytes
        
        vm.expectRevert(InteractionMock.InvalidExtraDataLength.selector);
        interactionMock.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
    }

    // Test postInteraction with taking amount too high
    function testPostInteractionTakingAmountTooHigh() public {
        uint256 takingAmount = 2500;
        uint256 threshold = 2000; // Lower than takingAmount
        
        bytes memory extraData = abi.encode(threshold);
        
        vm.expectRevert(InteractionMock.TakingAmountTooHigh.selector);
        interactionMock.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
    }

    // Fuzz test for preInteraction
    function testPreInteractionFuzz(uint256 takingAmount, uint256 targetAmount) public {
        bytes memory extraData = abi.encode(targetAmount);
        
        if (takingAmount == targetAmount) {
            // Should succeed when amounts match
            interactionMock.preInteraction(
                mockOrder,
                mockExtension,
                mockOrderHash,
                mockTaker,
                mockMakingAmount,
                takingAmount,
                mockRemainingMakingAmount,
                extraData
            );
        } else {
            // Should revert when amounts don't match
            vm.expectRevert(InteractionMock.IncorrectTakingAmount.selector);
            interactionMock.preInteraction(
                mockOrder,
                mockExtension,
                mockOrderHash,
                mockTaker,
                mockMakingAmount,
                takingAmount,
                mockRemainingMakingAmount,
                extraData
            );
        }
    }

    // Fuzz test for postInteraction
    function testPostInteractionFuzz(uint256 takingAmount, uint256 threshold) public {
        bytes memory extraData = abi.encode(threshold);
        
        if (takingAmount <= threshold) {
            // Should succeed when takingAmount is within threshold
            interactionMock.postInteraction(
                mockOrder,
                mockExtension,
                mockOrderHash,
                mockTaker,
                mockMakingAmount,
                takingAmount,
                mockRemainingMakingAmount,
                extraData
            );
        } else {
            // Should revert when takingAmount exceeds threshold
            vm.expectRevert(InteractionMock.TakingAmountTooHigh.selector);
            interactionMock.postInteraction(
                mockOrder,
                mockExtension,
                mockOrderHash,
                mockTaker,
                mockMakingAmount,
                takingAmount,
                mockRemainingMakingAmount,
                extraData
            );
        }
    }

    // Test edge case: empty extra data
    function testEmptyExtraData() public {
        bytes memory emptyExtraData = "";
        
        vm.expectRevert(InteractionMock.InvalidExtraDataLength.selector);
        interactionMock.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            1000,
            mockRemainingMakingAmount,
            emptyExtraData
        );
        
        vm.expectRevert(InteractionMock.InvalidExtraDataLength.selector);
        interactionMock.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            1000,
            mockRemainingMakingAmount,
            emptyExtraData
        );
    }

    // Test edge case: exactly 32 bytes extra data
    function testExactly32BytesExtraData() public {
        uint256 takingAmount = 1000;
        uint256 value = 1000;
        
        bytes memory extraData = abi.encode(value);
        assertEq(extraData.length, 32, "Extra data should be exactly 32 bytes");
        
        // Should work for both functions with exactly 32 bytes
        interactionMock.preInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
        
        interactionMock.postInteraction(
            mockOrder,
            mockExtension,
            mockOrderHash,
            mockTaker,
            mockMakingAmount,
            takingAmount,
            mockRemainingMakingAmount,
            extraData
        );
    }
} 