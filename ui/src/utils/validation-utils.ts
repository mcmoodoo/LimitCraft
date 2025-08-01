import { ALLOWED_INPUT_KEYS } from '../constants/order-constants';

// Handler to prevent invalid key presses
export const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  // Allow Ctrl/Cmd combinations (copy, paste, select all, etc.)
  if (e.ctrlKey || e.metaKey) {
    return;
  }

  if (!ALLOWED_INPUT_KEYS.includes(e.key)) {
    e.preventDefault();
    return;
  }

  // Prevent multiple decimal points
  if (e.key === '.' && e.currentTarget.value.includes('.')) {
    e.preventDefault();
  }
};

// Validate and format amount input
export const validateAmountInput = (value: string, decimals: number): string | null => {
  // Allow empty value
  if (value === '') {
    return '';
  }

  // Prevent leading zeros (except for decimal numbers like 0.5)
  if (value.length > 1 && value[0] === '0' && value[1] !== '.') {
    return null; // Invalid input
  }

  // Regex to allow only digits and single decimal point
  const regex = /^\d*\.?\d*$/;
  if (!regex.test(value)) {
    return null; // Invalid format
  }

  const decimalParts = value.split('.');

  // If there's a decimal part, check if it exceeds allowed decimals
  if (decimalParts.length === 2 && decimalParts[1].length > decimals) {
    // Truncate to allowed decimal places
    return `${decimalParts[0]}.${decimalParts[1].substring(0, decimals)}`;
  }

  return value;
};