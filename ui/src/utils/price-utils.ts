// Safe parsing function that handles NaN
const safeParseFloat = (value: string | number, defaultValue: number = 0): number => {
  if (typeof value === 'number') return isNaN(value) ? defaultValue : value;
  if (typeof value !== 'string' || value.trim() === '') return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

// Get numerical percentage difference for logic
export const getMarketRatePercentageNum = (
  makerAsset: string,
  takerAsset: string,
  makingAmount: string,
  takingAmount: string,
  tokenPrices: Record<string, number>
): number => {
  if (!makerAsset || !takerAsset || !makingAmount || !takingAmount) return 0;

  const makerPrice = tokenPrices[makerAsset.toLowerCase()];
  const takerPrice = tokenPrices[takerAsset.toLowerCase()];

  if (!makerPrice || !takerPrice) return 0;

  const makingNum = safeParseFloat(makingAmount, 0);
  const takingNum = safeParseFloat(takingAmount, 0);

  if (makingNum === 0 || takingNum === 0) return 0;

  const marketRate = makerPrice / takerPrice;
  const userRate = takingNum / makingNum;

  return ((userRate - marketRate) / marketRate) * 100;
};

// Get position for spectrum slider (0-100% positioning)
export const getSpectrumPosition = (
  makerAsset: string,
  takerAsset: string,
  makingAmount: string,
  takingAmount: string,
  tokenPrices: Record<string, number>
): number => {
  const percentage = getMarketRatePercentageNum(makerAsset, takerAsset, makingAmount, takingAmount, tokenPrices);
  // Clamp between -50% and +50%, then convert to 0-100% scale for positioning
  const clampedPercentage = Math.max(-50, Math.min(50, percentage));
  return clampedPercentage + 50; // Simplified from ((clampedPercentage + 50) / 100) * 100
};

// Get color based on slider position with non-linear transitions
export const getSliderColor = (position: number): string => {
  const clampedPosition = Math.max(0, Math.min(100, position));

  // Convert position (0-100) to market percentage (-50% to +50%)
  const marketPercentage = (clampedPosition / 100) * 100 - 50;

  if (marketPercentage < 0) {
    // Left side: Red to Light Green
    if (marketPercentage >= -5) {
      // -5% to 0%: Light Red to Orange to Light Green transition
      if (marketPercentage >= -2.5) {
        // -2.5% to 0%: Orange to Light Green
        const orangeToGreenFactor = Math.abs(marketPercentage) / 2.5;
        // Orange (255,165,0) to Light Green (144,238,144)
        const red = Math.round(255 * orangeToGreenFactor + 144 * (1 - orangeToGreenFactor));
        const green = Math.round(165 * orangeToGreenFactor + 238 * (1 - orangeToGreenFactor));
        const blue = Math.round(0 * orangeToGreenFactor + 144 * (1 - orangeToGreenFactor));
        return `rgb(${red}, ${green}, ${blue})`;
      } else {
        // -5% to -2.5%: Light Red to Orange
        const lightRedToOrangeFactor = (Math.abs(marketPercentage) - 2.5) / 2.5;
        // Light Red (255,128,128) to Orange (255,165,0)
        const red = 255;
        const green = Math.round(128 + (165 - 128) * (1 - lightRedToOrangeFactor));
        const blue = Math.round(128 * lightRedToOrangeFactor);
        return `rgb(${red}, ${green}, ${blue})`;
      }
    } else {
      // -50% to -5%: Complete Red to Light Red
      const factor = (Math.abs(marketPercentage) - 5) / 45; // 0 at -5%, 1 at -50%
      // Complete Red (255,0,0) to Light Red (255,128,128)
      const red = 255;
      const green = Math.round(128 * (1 - factor));
      const blue = Math.round(128 * (1 - factor));
      return `rgb(${red}, ${green}, ${blue})`;
    }
  } else if (marketPercentage === 0) {
    // Exactly at 0%: Light Green
    return 'rgb(144, 238, 144)';
  } else {
    // Right side: Light Green to Dark Green (0% to +50%)
    const normalizedPos = marketPercentage / 50; // 0 to 1

    let factor;
    if (normalizedPos <= 0.04) {
      // 0% to +2% (slow transition)
      factor = (normalizedPos / 0.04) * 0.3; // Light green range
    } else {
      // +2% to +50% (accelerate to dark green)
      const remaining = (normalizedPos - 0.04) / 0.96;
      factor = 0.3 + remaining * 0.7; // Accelerate to dark green
    }

    // Light Green (144,238,144) to Dark Green (0,100,0)
    const red = Math.round(144 * (1 - factor));
    const green = Math.round(238 - 138 * factor); // 238 to 100
    const blue = Math.round(144 * (1 - factor));
    return `rgb(${red}, ${green}, ${blue})`;
  }
};

// Convert mouse position to market percentage
export const positionToPercentage = (position: number): number => {
  // Position is 0-100%, convert to -50% to +50% market percentage
  const clampedPosition = Math.max(0, Math.min(100, position));
  return (clampedPosition / 100) * 100 - 50;
};