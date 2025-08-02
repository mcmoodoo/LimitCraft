// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/InteractionManager.sol";
import "../src/TwapCalculator.sol";

contract DeployInteractionManager is Script {
    function run() external {
        // uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Aave v3 Pool address for Arbitrum (forked mainnet)
        address aavePoolAddress = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy TwapCalculator
        TwapCalculator twapCalculator = new TwapCalculator();
        console.log("TwapCalculator deployed to:", address(twapCalculator));
        
        InteractionManager interactionManager = new InteractionManager(aavePoolAddress, address(twapCalculator));
        
        vm.stopBroadcast();
        
        console.log("InteractionManager deployed to:", address(interactionManager));
        console.log("Using Aave Pool address:", aavePoolAddress);
    }
}