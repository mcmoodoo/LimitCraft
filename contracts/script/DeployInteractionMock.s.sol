// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/InteractionMock.sol";

contract DeployInteractionMock is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        InteractionMock interactionMock = new InteractionMock();
        
        vm.stopBroadcast();
        
        console.log("InteractionMock deployed to:", address(interactionMock));
    }
}
