// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/InteractionMock.sol";

contract DeployInteractionMock is Script {
    function run() external {
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        
        vm.startBroadcast(deployerPrivateKey);
        
        InteractionMock interactionMock = new InteractionMock();
        
        vm.stopBroadcast();
        
        console.log("InteractionMock deployed to:", address(interactionMock));
    }
}
