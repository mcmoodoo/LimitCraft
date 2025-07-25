import React from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';

const HomePage = () => {
  const { isConnected } = useAccount();

  return (
    <div className="text-center">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Welcome to Orderly
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          A decentralized order book system for trading digital assets with EIP712 signatures
        </p>
        
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">View Orders</h3>
            <p className="text-gray-600 mb-4">
              Browse all limit orders in the system with filtering and sorting options
            </p>
            <Link 
              to="/orders"
              className="inline-block bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors"
            >
              View Orders
            </Link>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Create Order</h3>
            <p className="text-gray-600 mb-4">
              Place a new limit order with custom parameters and digital signature
            </p>
            {isConnected ? (
              <Link 
                to="/create-order"
                className="inline-block bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
              >
                Create Order
              </Link>
            ) : (
              <p className="text-sm text-gray-500">Connect your wallet to create orders</p>
            )}
          </div>
        </div>
        
        <div className="bg-blue-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">How It Works</h3>
          <div className="grid md:grid-cols-3 gap-4 text-left">
            <div>
              <div className="bg-blue-100 w-8 h-8 rounded-full flex items-center justify-center text-blue-600 font-bold mb-2">
                1
              </div>
              <h4 className="font-medium mb-1">Connect Wallet</h4>
              <p className="text-sm text-gray-600">Connect your Ethereum wallet using RainbowKit</p>
            </div>
            <div>
              <div className="bg-blue-100 w-8 h-8 rounded-full flex items-center justify-center text-blue-600 font-bold mb-2">
                2
              </div>
              <h4 className="font-medium mb-1">Create Order</h4>
              <p className="text-sm text-gray-600">Fill out order details and sign with EIP712</p>
            </div>
            <div>
              <div className="bg-blue-100 w-8 h-8 rounded-full flex items-center justify-center text-blue-600 font-bold mb-2">
                3
              </div>
              <h4 className="font-medium mb-1">Trade</h4>
              <p className="text-sm text-gray-600">Your order is stored and ready for matching</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;