// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/TwapCalculator.sol";

contract DeployTwapCalculator is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy TwapCalculator contract
        // The constructor automatically sets up the ETH/USD price feed for Arbitrum
        TwapCalculator twapCalculator = new TwapCalculator();
        
        vm.stopBroadcast();
        
        console.log("TwapCalculator deployed to:", address(twapCalculator));
        console.log("Using Chainlink ETH/USD price feed on Arbitrum:", 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612);
        
        // Verify the deployment by checking the latest ETH price
        try twapCalculator.getLatestETHPrice() returns (uint256 price, uint256 updatedAt) {
            console.log("Latest ETH price:", price);
            console.log("Price last updated at:", updatedAt);
            console.log("Current timestamp:", block.timestamp);
        } catch {
            console.log("Warning: Could not fetch ETH price - may be due to network issues");
        }
    }
}