import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';
import { navigationHelpers } from '../router/navigation';

interface BreadcrumbRoute {
  label: string;
  path?: string;
  icon?: React.ReactNode;
}

export function Breadcrumbs() {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);

  const getBreadcrumbs = (): BreadcrumbRoute[] => {
    const breadcrumbs: BreadcrumbRoute[] = [
      {
        label: 'Home',
        path: navigationHelpers.toHome(),
        icon: <Home className="w-4 h-4" />,
      },
    ];

    if (pathSegments[0] === 'orders') {
      breadcrumbs.push({
        label: 'Orders',
        path: pathSegments.length === 1 ? undefined : navigationHelpers.toOrders(),
      });

      if (pathSegments[1] === 'create') {
        breadcrumbs.push({
          label: 'Create Order',
        });
      } else if (pathSegments[1]) {
        breadcrumbs.push({
          label: 'Order Details',
        });
      }
    }

    return breadcrumbs;
  };

  const breadcrumbItems = getBreadcrumbs();

  // Don't show breadcrumbs on home page
  if (breadcrumbItems.length <= 1) {
    return null;
  }

  return (
    <div className="mb-6 px-6 -mx-6 py-3 bg-gradient-to-r from-gray-900/50 via-gray-800/50 to-gray-900/50 border-b border-gray-700/50">
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbItems.map((item, index) => {
            const isLast = index === breadcrumbItems.length - 1;
            
            return (
              <React.Fragment key={index}>
                <BreadcrumbItem>
                  {isLast || !item.path ? (
                    <BreadcrumbPage className="flex items-center gap-2 text-white font-medium">
                      {item.icon}
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link 
                        to={item.path} 
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && (
                  <BreadcrumbSeparator>
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </BreadcrumbSeparator>
                )}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}