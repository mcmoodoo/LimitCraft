import { ROUTES, type RouteParams } from './routes';

export const createNavigationHelpers = () => ({
  toHome: () => ROUTES.HOME,
  toOrders: () => ROUTES.ORDERS.LIST,
  toCreateOrder: (searchParams?: URLSearchParams) => {
    const url = ROUTES.ORDERS.CREATE;
    return searchParams ? `${url}?${searchParams.toString()}` : url;
  },
  toOrderDetails: (orderHash: string) => ROUTES.ORDERS.DETAIL.replace(':orderHash', orderHash),
  toOrderCancel: (orderHash: string) => ROUTES.ORDERS.CANCEL.replace(':orderHash', orderHash),
  toWalletConnect: (returnTo?: string) => {
    const url = ROUTES.WALLET.CONNECT;
    return returnTo ? `${url}?returnTo=${encodeURIComponent(returnTo)}` : url;
  },
  toWalletProfile: () => ROUTES.WALLET.PROFILE,
  toMarkets: () => ROUTES.MARKETS,
  toPortfolio: () => ROUTES.PORTFOLIO,
  toSettings: () => ROUTES.SETTINGS,
});

export const navigationHelpers = createNavigationHelpers();

export const isActiveRoute = (currentPath: string, routePath: string, exact = false): boolean => {
  if (exact) {
    return currentPath === routePath;
  }

  if (routePath === ROUTES.HOME) {
    return currentPath === ROUTES.HOME;
  }

  return currentPath.startsWith(routePath);
};

export const extractRouteParams = (pathname: string, routePattern: string): RouteParams | null => {
  const routeRegex = routePattern.replace(/:[^/]+/g, '([^/]+)');
  const match = pathname.match(new RegExp(`^${routeRegex}$`));

  if (!match) return null;

  const paramNames = routePattern.match(/:[^/]+/g) || [];
  const params: Partial<RouteParams> = {};

  paramNames.forEach((param, index) => {
    const paramName = param.slice(1) as keyof RouteParams;
    params[paramName] = match[index + 1];
  });

  return params as RouteParams;
};
