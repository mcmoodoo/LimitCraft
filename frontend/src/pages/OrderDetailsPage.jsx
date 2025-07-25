import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useOrder } from '../hooks/useOrders';

const OrderDetailsPage = () => {
  const { orderHash } = useParams();
  const { data: order, isLoading, error } = useOrder(orderHash);

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
      <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <p className="mt-2 text-gray-600">Loading order details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">Error loading order: {error.message}</div>
        <Link 
          to="/orders"
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
        >
          Back to Orders
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">Order not found</div>
        <Link 
          to="/orders"
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
        >
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Link 
            to="/orders"
            className="text-primary-600 hover:text-primary-700"
          >
            ← Back to Orders
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
        </div>
        {getStatusBadge(order.status)}
      </div>

      <div className="grid gap-6">
        {/* Basic Information */}
        <div className="bg-white shadow-sm rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Hash</label>
              <div className="flex items-center space-x-2">
                <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono break-all">
                  {order.order_hash}
                </code>
                <button
                  onClick={() => copyToClipboard(order.order_hash)}
                  className="text-gray-500 hover:text-gray-700"
                  title="Copy to clipboard"
                >
                  📋
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maker Address</label>
              <div className="flex items-center space-x-2">
                <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                  {order.maker_address}
                </code>
                <button
                  onClick={() => copyToClipboard(order.maker_address)}
                  className="text-gray-500 hover:text-gray-700"
                  title="Copy to clipboard"
                >
                  📋
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Asset Information */}
        <div className="bg-white shadow-sm rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Asset Information</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Maker Asset</h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <div className="flex items-center space-x-2">
                    <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                      {order.maker_asset}
                    </code>
                    <button
                      onClick={() => copyToClipboard(order.maker_asset)}
                      className="text-gray-500 hover:text-gray-700"
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount</label>
                  <div className="text-lg font-semibold">
                    {formatAmount(order.making_amount)} tokens
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-2">Taker Asset</h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <div className="flex items-center space-x-2">
                    <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                      {order.taker_asset}
                    </code>
                    <button
                      onClick={() => copyToClipboard(order.taker_asset)}
                      className="text-gray-500 hover:text-gray-700"
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount</label>
                  <div className="text-lg font-semibold">
                    {formatAmount(order.taking_amount)} tokens
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-1">Exchange Rate</h4>
            <p className="text-blue-700">
              1 Maker Token = {(
                parseFloat(formatAmount(order.taking_amount)) / 
                parseFloat(formatAmount(order.making_amount))
              ).toFixed(6)} Taker Tokens
            </p>
          </div>
        </div>

        {/* Timestamps */}
        <div className="bg-white shadow-sm rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Timeline</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Created At</label>
              <div className="text-gray-900">{formatDate(order.created_at)}</div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Updated At</label>
              <div className="text-gray-900">{formatDate(order.updated_at)}</div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
              <div className={`${new Date(order.expires_in) < new Date() ? 'text-red-600' : 'text-gray-900'}`}>
                {formatDate(order.expires_in)}
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Details */}
        <div className="bg-white shadow-sm rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Advanced Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Signature</label>
              <div className="flex items-center space-x-2">
                <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono break-all w-full">
                  0x{Buffer.from(order.signature).toString('hex')}
                </code>
                <button
                  onClick={() => copyToClipboard('0x' + Buffer.from(order.signature).toString('hex'))}
                  className="text-gray-500 hover:text-gray-700 flex-shrink-0"
                  title="Copy to clipboard"
                >
                  📋
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maker Traits</label>
              <pre className="bg-gray-100 px-3 py-2 rounded text-sm overflow-x-auto">
                {JSON.stringify(order.maker_traits, null, 2)}
              </pre>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Extension</label>
              <pre className="bg-gray-100 px-3 py-2 rounded text-sm overflow-x-auto">
                {JSON.stringify(order.extension, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsPage;