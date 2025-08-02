import { Link, useLocation } from 'react-router-dom';
import { Home, FileText, Plus } from 'lucide-react';
import { isActiveRoute } from '../../router/navigation';
import { ROUTES } from '../../router/routes';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';

interface NavigationItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  highlight?: boolean;
  badge?: string;
}

const navigationItems: NavigationItem[] = [
  {
    path: ROUTES.HOME,
    label: 'Home',
    icon: Home,
    exact: true,
  },
  {
    path: ROUTES.ORDERS.LIST,
    label: 'Orders',
    icon: FileText,
  },
  {
    path: ROUTES.ORDERS.CREATE,
    label: 'Create Order',
    icon: Plus,
    highlight: true,
  },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="flex items-center space-x-2">
      {navigationItems.map((item) => {
        const isActive = isActiveRoute(location.pathname, item.path, item.exact);
        const IconComponent = item.icon;

        if (item.highlight) {
          return (
            <Button
              key={item.path}
              asChild
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn(
                "relative transition-all duration-200",
                isActive 
                  ? "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg shadow-green-500/25" 
                  : "border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300 hover:border-green-400"
              )}
            >
              <Link to={item.path} className="flex items-center gap-2">
                <IconComponent className="w-4 h-4" />
                <span className="font-medium">{item.label}</span>
              </Link>
            </Button>
          );
        }

        return (
          <Button
            key={item.path}
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              "transition-all duration-200",
              isActive
                ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                : "text-gray-400 hover:text-white hover:bg-gray-800/50"
            )}
          >
            <Link to={item.path} className="flex items-center gap-2">
              <IconComponent className="w-4 h-4" />
              <span>{item.label}</span>
              {isActive && (
                <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" />
              )}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
