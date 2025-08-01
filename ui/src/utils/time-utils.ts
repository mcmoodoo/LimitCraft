import { EXPIRATION_MINUTES } from '../constants/order-constants';

// Helper functions for slider synchronization (working with minutes)
export const getSliderValueFromExpiration = (expiresIn: number): number => {
  const minutes = Math.round(expiresIn / 60);
  const index = EXPIRATION_MINUTES.findIndex((min) => min === minutes);
  return index >= 0 ? index : 4; // Default to 60 minutes index
};

export const getExpirationFromSliderValue = (sliderValue: number): number => {
  const minutes = EXPIRATION_MINUTES[sliderValue] || 60; // Default to 60 minutes
  return minutes * 60; // Convert to seconds for form.expiresIn
};

// Convert seconds to minutes for display
export const getMinutesFromSeconds = (seconds: number): number => {
  return Math.round(seconds / 60);
};

// Format expiration time for display
export const formatExpirationTime = (expiresIn: number): string => {
  const minutes = getMinutesFromSeconds(expiresIn);
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    const hours = minutes / 60;
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
};