#!/bin/bash

# Extract deployed contract addresses from Foundry broadcast files
# Usage: ./scripts/extract-deployments.sh [network]
# Example: ./scripts/extract-deployments.sh localhost

NETWORK=${1:-localhost}
BROADCAST_DIR="broadcast"
OUTPUT_FILE="deployments.json"

# Check if broadcast directory exists
if [ ! -d "$BROADCAST_DIR" ]; then
    echo "Error: Broadcast directory not found. Run a deployment first."
    exit 1
fi

# Find the latest broadcast file for the network
LATEST_FILE=$(find "$BROADCAST_DIR" -name "run-latest.json" -path "*/$NETWORK/*" | head -1)

if [ -z "$LATEST_FILE" ]; then
    echo "Error: No broadcast file found for network: $NETWORK"
    echo "Available networks:"
    find "$BROADCAST_DIR" -type d -mindepth 1 -maxdepth 1 | sed 's|.*/||'
    exit 1
fi

echo "Extracting deployments from: $LATEST_FILE"

# Extract contract deployments using jq
DEPLOYMENTS=$(jq -r '
.transactions[] | 
select(.transactionType == "CREATE") | 
{
    contractName: .contractName,
    contractAddress: .contractAddress,
    transactionHash: .hash,
    blockNumber: .receipt.blockNumber
}' "$LATEST_FILE")

# Create or update deployments.json
if [ ! -f "$OUTPUT_FILE" ]; then
    echo "{}" > "$OUTPUT_FILE"
fi

# Update the deployments file with new data
echo "$DEPLOYMENTS" | jq -s "
{
    \"$NETWORK\": {
        \"lastUpdated\": now | strftime(\"%Y-%m-%dT%H:%M:%SZ\"),
        \"contracts\": (. | map({(.contractName): {
            \"address\": .contractAddress,
            \"transactionHash\": .transactionHash,
            \"blockNumber\": .blockNumber
        }}) | add)
    }
}" > temp_deployments.json

# Merge with existing deployments
jq -s '.[0] * .[1]' "$OUTPUT_FILE" temp_deployments.json > temp_merge.json
mv temp_merge.json "$OUTPUT_FILE"
rm temp_deployments.json

echo "✅ Deployments extracted to $OUTPUT_FILE"
echo "📋 Deployed contracts for $NETWORK:"
jq -r ".\"$NETWORK\".contracts | to_entries[] | \"  \(.key): \(.value.address)\"" "$OUTPUT_FILE"