# Troubleshooting: Order Resolver Error

## Problem Description

The order resolver was failing to fill orders with the following error:

```
⚠ Could not check predicate, proceeding anyway: warn: execution reverted (no data present; likely require(false) occurred)
❌ Error filling order: execution reverted (no data present; likely require(false) occurred)
```

## Root Cause Analysis

The issue was in the `reconstructOrderStruct` function in `resolver/src/filler.ts:123-138`. The function was not properly reconstructing the order data structure that matches what was originally created and signed.

### Specific Issues Identified:

1. **Incorrect Salt Generation**: 
   - **Problem**: Using `BigInt(Date.now())` instead of the actual salt from the order
   - **Impact**: The reconstructed order would never match the originally signed order

2. **Improper MakerTraits Handling**:
   - **Problem**: Using raw `makerTraits` string as `offsets` field
   - **Impact**: The offsets field should contain encoded position data, not the raw makerTraits

3. **Missing Extension Decoding**:
   - **Problem**: Not properly decoding the extension field containing interaction data
   - **Impact**: The interactions data wasn't being handled correctly

4. **Missing MakerTraits Data Extraction**:
   - **Problem**: Not extracting `receiver` and `allowedSender` from makerTraits
   - **Impact**: Using hardcoded zero addresses instead of the actual values

## Investigation Process

1. **Examined resolver code structure** (`resolver/src/index.ts`, `resolver/src/filler.ts`)
2. **Analyzed the failing checkPredicate function call** - identified contract rejecting reconstructed order
3. **Reviewed order data structure** (`db/src/schema.ts`) - understood how data is stored
4. **Investigated 1inch contract interaction** - found mismatch between stored and reconstructed data
5. **Traced order creation process** (`api/src/index.ts`) - discovered how makerTraits and extension are encoded

## Solution Implemented

Fixed the `reconstructOrderStruct` function in `resolver/src/filler.ts`:

### Key Changes:

1. **Added proper imports**:
   ```typescript
   import { MakerTraits, Extension } from '@1inch/limit-order-sdk';
   ```

2. **Proper salt extraction**:
   ```typescript
   const makerTraits = MakerTraits.fromBigInt(BigInt(order.makerTraits));
   const salt = makerTraits.nonce;
   ```

3. **Extension decoding**:
   ```typescript
   const extension = Extension.decode(order.extension);
   ```

4. **Correct field mapping**:
   ```typescript
   return {
     salt: salt,
     receiver: makerTraits.receiver || '0x0000000000000000000000000000000000000000',
     allowedSender: makerTraits.allowedSender || '0x0000000000000000000000000000000000000000',
     offsets: this.calculateOffsets(extension),
     // ... other fields
   };
   ```

5. **Added offset calculation helper**:
   ```typescript
   private calculateOffsets(extension: Extension): bigint {
     const interactions = extension.encode();
     if (interactions === '0x') {
       return BigInt(0);
     }
     return BigInt(interactions.length - 2) / 2n;
   }
   ```

6. **Added error handling** with fallback to basic structure if decoding fails

## Files Modified

- `resolver/src/filler.ts` - Fixed `reconstructOrderStruct` function and added proper 1inch SDK imports

## Expected Outcome

The resolver should now be able to:
- Properly reconstruct order structs that match the originally signed orders
- Pass the `checkPredicate` validation
- Successfully execute `fillOrder` transactions
- Fill profitable orders without the `require(false)` errors

## Prevention

To prevent similar issues in the future:
- Ensure proper decoding of encoded data when reconstructing contract call parameters
- Use the same SDK/libraries for both order creation and order filling
- Add comprehensive error handling and logging for contract interactions
- Test order reconstruction against known good orders before deployment