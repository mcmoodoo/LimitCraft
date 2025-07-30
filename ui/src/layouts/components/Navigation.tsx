import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../router/routes';
import { isActiveRoute } from '../../router/navigation';

interface NavigationItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
  highlight?: boolean;
}

const navigationItems: NavigationItem[] = [
  {
    path: ROUTES.HOME,
    label: 'Home',
    icon: '🏠',
    exact: true,
  },
  {
    path: ROUTES.ORDERS.LIST,
    label: 'Orders',
    icon: '📋',
  },
  {
    path: ROUTES.ORDERS.CREATE,
    label: 'Create Order',
    icon: '➕',
    highlight: true,
  },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="flex items-center space-x-6">
      {navigationItems.map((item) => {
        const isActive = isActiveRoute(location.pathname, item.path, item.exact);

        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center space-x-2 transition-colors ${
              isActive
                ? 'text-blue-400'
                : item.highlight
                  ? 'text-green-400 hover:text-green-300'
                  : 'text-gray-300 hover:text-white'
            }`}
          >
            <span className="text-sm">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
