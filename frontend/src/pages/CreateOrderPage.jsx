import React, { useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { useCreateOrder } from '../hooks/useOrders';
import { createOrderTypedData } from '../utils/eip712';

const CreateOrderPage = () => {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const createOrderMutation = useCreateOrder();

  const [formData, setFormData] = useState({
    makerAsset: '',
    takerAsset: '',
    makingAmount: '',
    takingAmount: '',
    expiresIn: '',
    makerTraits: {},
    extension: {}
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [makerTraitsText, setMakerTraitsText] = useState('{}');
  const [extensionText, setExtensionText] = useState('{}');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAdvancedChange = (field, value) => {
    try {
      const parsed = JSON.parse(value);
      setFormData(prev => ({
        ...prev,
        [field]: parsed
      }));
    } catch (error) {
      // Invalid JSON, keep the text but don't update formData
    }
  };

  const validateForm = () => {
    const errors = [];
    
    if (!formData.makerAsset || !/^0x[a-fA-F0-9]{40}$/.test(formData.makerAsset)) {
      errors.push('Maker asset must be a valid Ethereum address');
    }
    
    if (!formData.takerAsset || !/^0x[a-fA-F0-9]{40}$/.test(formData.takerAsset)) {
      errors.push('Taker asset must be a valid Ethereum address');
    }
    
    if (!formData.makingAmount || parseFloat(formData.makingAmount) <= 0) {
      errors.push('Making amount must be positive');
    }
    
    if (!formData.takingAmount || parseFloat(formData.takingAmount) <= 0) {
      errors.push('Taking amount must be positive');
    }
    
    if (!formData.expiresIn || new Date(formData.expiresIn) <= new Date()) {
      errors.push('Expiration must be in the future');
    }
    
    try {
      JSON.parse(makerTraitsText);
    } catch {
      errors.push('Maker traits must be valid JSON');
    }
    
    try {
      JSON.parse(extensionText);
    } catch {
      errors.push('Extension must be valid JSON');
    }
    
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    const errors = validateForm();
    if (errors.length > 0) {
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    try {
      // Convert amounts to wei (18 decimals)
      const makingAmountWei = (BigInt(Math.floor(parseFloat(formData.makingAmount) * 1e18))).toString();
      const takingAmountWei = (BigInt(Math.floor(parseFloat(formData.takingAmount) * 1e18))).toString();

      const orderData = {
        makerAsset: formData.makerAsset,
        takerAsset: formData.takerAsset,
        makingAmount: makingAmountWei,
        takingAmount: takingAmountWei,
        makerAddress: address,
        expiresIn: formData.expiresIn,
        makerTraits: JSON.parse(makerTraitsText),
        extension: JSON.parse(extensionText)
      };

      // Create typed data for EIP712 signing
      const typedData = createOrderTypedData(orderData);

      // Sign the typed data
      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.value
      });

      // Submit order with signature
      await createOrderMutation.mutateAsync({
        ...orderData,
        signature
      });

      // Reset form on success
      setFormData({
        makerAsset: '',
        takerAsset: '',
        makingAmount: '',
        takingAmount: '',
        expiresIn: '',
        makerTraits: {},
        extension: {}
      });
      setMakerTraitsText('{}');
      setExtensionText('{}');
      setShowAdvanced(false);

      alert('Order created successfully!');
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Error creating order: ' + (error.message || 'Unknown error'));
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Create Order</h1>
        <p className="text-gray-600 mb-6">Please connect your wallet to create orders</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Order</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white shadow-sm rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
          
          <div className="grid gap-4">
            <div>
              <label htmlFor="makerAsset" className="block text-sm font-medium text-gray-700 mb-1">
                Maker Asset Address *
              </label>
              <input
                type="text"
                id="makerAsset"
                name="makerAsset"
                value={formData.makerAsset}
                onChange={handleInputChange}
                placeholder="0x..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
            
            <div>
              <label htmlFor="makingAmount" className="block text-sm font-medium text-gray-700 mb-1">
                Making Amount *
              </label>
              <input
                type="number"
                id="makingAmount"
                name="makingAmount"
                value={formData.makingAmount}
                onChange={handleInputChange}
                placeholder="0.0"
                step="0.000000000000000001"
                min="0"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
            
            <div>
              <label htmlFor="takerAsset" className="block text-sm font-medium text-gray-700 mb-1">
                Taker Asset Address *
              </label>
              <input
                type="text"
                id="takerAsset"
                name="takerAsset"
                value={formData.takerAsset}
                onChange={handleInputChange}
                placeholder="0x..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
            
            <div>
              <label htmlFor="takingAmount" className="block text-sm font-medium text-gray-700 mb-1">
                Taking Amount *
              </label>
              <input
                type="number"
                id="takingAmount"
                name="takingAmount"
                value={formData.takingAmount}
                onChange={handleInputChange}
                placeholder="0.0"
                step="0.000000000000000001"
                min="0"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
            
            <div>
              <label htmlFor="expiresIn" className="block text-sm font-medium text-gray-700 mb-1">
                Expiration Date & Time *
              </label>
              <input
                type="datetime-local"
                id="expiresIn"
                name="expiresIn"
                value={formData.expiresIn}
                onChange={handleInputChange}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Exchange Rate Preview */}
        {formData.makingAmount && formData.takingAmount && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Exchange Rate Preview</h3>
            <p className="text-blue-700">
              1 Maker Token = {(parseFloat(formData.takingAmount) / parseFloat(formData.makingAmount)).toFixed(6)} Taker Tokens
            </p>
            <p className="text-blue-700">
              1 Taker Token = {(parseFloat(formData.makingAmount) / parseFloat(formData.takingAmount)).toFixed(6)} Maker Tokens
            </p>
          </div>
        )}

        {/* Advanced Configuration */}
        <div className="bg-white shadow-sm rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Advanced Configuration</h2>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>
          </div>
          
          {showAdvanced && (
            <div className="space-y-4">
              <div>
                <label htmlFor="makerTraits" className="block text-sm font-medium text-gray-700 mb-1">
                  Maker Traits (JSON)
                </label>
                <textarea
                  id="makerTraits"
                  value={makerTraitsText}
                  onChange={(e) => {
                    setMakerTraitsText(e.target.value);
                    handleAdvancedChange('makerTraits', e.target.value);
                  }}
                  rows={4}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                  placeholder='{"key": "value"}'
                />
              </div>
              
              <div>
                <label htmlFor="extension" className="block text-sm font-medium text-gray-700 mb-1">
                  Extension (JSON)
                </label>
                <textarea
                  id="extension"
                  value={extensionText}
                  onChange={(e) => {
                    setExtensionText(e.target.value);
                    handleAdvancedChange('extension', e.target.value);
                  }}
                  rows={4}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                  placeholder='{"key": "value"}'
                />
              </div>
            </div>
          )}
        </div>

        {/* Connected Account Info */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2">Connected Account</h3>
          <p className="text-sm text-gray-600 font-mono">{address}</p>
          <p className="text-xs text-gray-500 mt-1">This will be set as the maker address</p>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => {
              setFormData({
                makerAsset: '',
                takerAsset: '',
                makingAmount: '',
                takingAmount: '',
                expiresIn: '',
                makerTraits: {},
                extension: {}
              });
              setMakerTraitsText('{}');
              setExtensionText('{}');
            }}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={createOrderMutation.isPending}
            className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createOrderMutation.isPending ? 'Creating Order...' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateOrderPage;