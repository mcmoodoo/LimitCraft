// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/LendingInteractionManager.sol";

contract DeployLendingInteractionManager is Script {
    function run() external {
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        
        // Aave v3 Pool address for Arbitrum (forked mainnet)
        address aavePoolAddress = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
        
        vm.startBroadcast(deployerPrivateKey);
        
        LendingInteractionManager lendingManager = new LendingInteractionManager(aavePoolAddress);
        
        vm.stopBroadcast();
        
        console.log("LendingInteractionManager deployed to:", address(lendingManager));
        console.log("Using Aave Pool address:", aavePoolAddress);
    }
}