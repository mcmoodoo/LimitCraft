const API_BASE_URL = 'http://localhost:3000/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(error.error || 'Request failed', response.status);
  }
  return response.json();
};

export const api = {
  // Get all orders with optional filters
  getOrders: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
    
    const url = `${API_BASE_URL}/orders${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url);
    return handleResponse(response);
  },

  // Get order by hash
  getOrder: async (orderHash) => {
    const response = await fetch(`${API_BASE_URL}/order/${orderHash}`);
    return handleResponse(response);
  },

  // Create new order
  createOrder: async (orderData) => {
    const response = await fetch(`${API_BASE_URL}/limit-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });
    return handleResponse(response);
  },
};

export { ApiError };