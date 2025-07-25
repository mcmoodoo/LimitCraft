import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrders } from '../hooks/useOrders';

const OrdersPage = () => {
  const [filters, setFilters] = useState({
    status: '',
    maker: '',
    limit: 20,
    offset: 0
  });

  const { data, isLoading, error, refetch } = useOrders(filters);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      offset: 0 // Reset pagination when filtering
    }));
  };

  const formatAmount = (amount) => {
    return (BigInt(amount) / BigInt('1000000000000000000')).toString();
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      pending: 'bg-yellow-100 text-yellow-800',
      filled: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const handlePagination = (direction) => {
    const newOffset = direction === 'next' 
      ? filters.offset + filters.limit
      : Math.max(0, filters.offset - filters.limit);
    
    setFilters(prev => ({ ...prev, offset: newOffset }));
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">Error loading orders: {error.message}</div>
        <button 
          onClick={() => refetch()}
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
        <Link 
          to="/create-order"
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors"
        >
          Create Order
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="filled">Filled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Maker Address</label>
            <input
              type="text"
              value={filters.maker}
              onChange={(e) => handleFilterChange('maker', e.target.value)}
              placeholder="0x..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Per Page</label>
            <select
              value={filters.limit}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => refetch()}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-gray-600">Loading orders...</p>
          </div>
        ) : !data?.orders?.length ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No orders found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order Hash
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Maker Asset
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Taker Asset
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amounts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.orders.map((order) => (
                    <tr key={order.order_hash} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                        {order.order_hash.slice(0, 10)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                        {order.maker_asset.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                        {order.taker_asset.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {formatAmount(order.making_amount)} / {formatAmount(order.taking_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          to={`/order/${order.order_hash}`}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => handlePagination('prev')}
                  disabled={filters.offset === 0}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePagination('next')}
                  disabled={!data?.orders?.length || data.orders.length < filters.limit}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing {filters.offset + 1} to {filters.offset + (data?.orders?.length || 0)} of results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => handlePagination('prev')}
                      disabled={filters.offset === 0}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePagination('next')}
                      disabled={!data?.orders?.length || data.orders.length < filters.limit}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrdersPage;