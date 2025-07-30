export const ROUTES = {
  HOME: '/',
  ORDERS: {
    LIST: '/orders',
    CREATE: '/orders/create',
    DETAIL: '/orders/:orderHash',
    CANCEL: '/orders/:orderHash/cancel',
  },
  WALLET: {
    CONNECT: '/wallet/connect',
    PROFILE: '/wallet/profile',
  },
  MARKETS: '/markets',
  PORTFOLIO: '/portfolio',
  SETTINGS: '/settings',
} as const;

export type RouteParams = {
  orderHash: string;
};

export const ROUTE_METADATA = {
  [ROUTES.HOME]: {
    title: 'Home - Orderly',
    description: 'Decentralized orderbook trading platform',
  },
  [ROUTES.ORDERS.LIST]: {
    title: 'My Orders - Orderly',
    description: 'View and manage your limit orders',
  },
  [ROUTES.ORDERS.CREATE]: {
    title: 'Create Order - Orderly',
    description: 'Create a new limit order with lending integration',
  },
  [ROUTES.ORDERS.DETAIL]: {
    title: 'Order Details - Orderly',
    description: 'View detailed information about your order',
  },
  [ROUTES.WALLET.CONNECT]: {
    title: 'Connect Wallet - Orderly',
    description: 'Connect your wallet to start trading',
  },
  [ROUTES.WALLET.PROFILE]: {
    title: 'Wallet Profile - Orderly',
    description: 'View your wallet information and settings',
  },
} as const;
