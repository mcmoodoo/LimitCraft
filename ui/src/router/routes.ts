export const ROUTES = {
  HOME: '/',
  ORDERS: {
    LIST: '/orders',
    CREATE: '/orders/create',
    DETAIL: '/orders/:orderHash',
  },
  WALLET: {
    CONNECT: '/wallet/connect',
  },
} as const;

export type RouteParams = {
  orderHash: string;
};

export const ROUTE_METADATA = {
  [ROUTES.HOME]: {
    title: 'Home - LimitCraft',
    description: 'Advanced Limit Order Crafting Platform for DeFi',
  },
  [ROUTES.ORDERS.LIST]: {
    title: 'My Orders - LimitCraft',
    description: 'View and manage your crafted limit orders',
  },
  [ROUTES.ORDERS.CREATE]: {
    title: 'Craft Order - LimitCraft',
    description: 'Craft a new limit order with advanced features',
  },
  [ROUTES.ORDERS.DETAIL]: {
    title: 'Order Details - LimitCraft',
    description: 'View detailed information about your crafted order',
  },
  [ROUTES.WALLET.CONNECT]: {
    title: 'Connect Wallet - LimitCraft',
    description: 'Connect your wallet to start crafting orders',
  },
} as const;
