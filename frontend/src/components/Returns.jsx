import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:5000/api';

export default function Returns() {
  const userObj = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = userObj.role === 'super_admin';

  const [returns, setReturns] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    sale_id: '',
    customer_id: '',
    product_id: '',
    quantity: '1',
    refund_amount: '0.00',
    notes: '',
    deduct_from_due: false
  });

  // Helper states for dynamic checkout details
  const [saleLoading, setSaleLoading] = useState(false);
  const [selectedSaleDetails, setSelectedSaleDetails] = useState(null);
  const [selectedProductDetails, setSelectedProductDetails] = useState(null);
  const [customerDueBalance, setCustomerDueBalance] = useState(0);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, startDate, endDate]);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `${API_BASE_URL}/returns?`;
      if (startDate) url += `start_date=${startDate}&`;
      if (endDate) url += `end_date=${endDate}&`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve product returns.');
      const data = await response.json();
      setReturns(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    if (isSuperAdmin) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (err) {
      console.error(err.message);
    }
  };

  const fetchCustomers = async () => {
    if (isSuperAdmin) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/customers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error(err.message);
    }
  };

  useEffect(() => {
    fetchReturns();
    fetchProducts();
    fetchCustomers();
  }, [startDate, endDate]);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  // Fetch sale details when sale_id is provided
  const handleSaleIdBlur = async () => {
    const saleId = formData.sale_id.trim();
    if (!saleId) {
      setSelectedSaleDetails(null);
      return;
    }

    setSaleLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/sales/${saleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Sale transaction ID not found.');
      }
      const saleData = await response.json();
      setSelectedSaleDetails(saleData);

      // Auto-fill customer if available
      if (saleData.customer_id) {
        setFormData(prev => ({
          ...prev,
          customer_id: String(saleData.customer_id)
        }));
        
        // Find due balance of the customer
        const cust = customers.find(c => String(c.id) === String(saleData.customer_id));
        if (cust) {
          setCustomerDueBalance(parseFloat(cust.due_balance || 0));
        }
      }
      triggerAlert('success', `Loaded details for Sale #${saleId}`);
    } catch (err) {
      setSelectedSaleDetails(null);
      triggerAlert('error', err.message);
    } finally {
      setSaleLoading(false);
    }
  };

  // Update refund amount and selected details when product, quantity, or sale details change
  useEffect(() => {
    let unitPrice = 0;
    let selectedProd = null;

    if (formData.product_id) {
      if (selectedSaleDetails) {
        // Find product in sale items
        const item = selectedSaleDetails.items?.find(
          i => String(i.product_id) === String(formData.product_id)
        );
        if (item) {
          unitPrice = parseFloat(item.unit_price || 0);
          selectedProd = {
            name: item.product_name,
            sku: item.product_sku,
            maxQty: item.quantity
          };
        }
      } else {
        // Find product in catalog
        const prod = products.find(p => String(p.id) === String(formData.product_id));
        if (prod) {
          unitPrice = parseFloat(prod.price || 0);
          selectedProd = {
            name: prod.name,
            sku: prod.sku,
            maxQty: Infinity
          };
        }
      }
    }

    setSelectedProductDetails(selectedProd);

    // Calculate refund amount automatically
    const qty = parseInt(formData.quantity || 0);
    const calculatedRefund = (qty * unitPrice).toFixed(2);

    setFormData(prev => ({
      ...prev,
      refund_amount: calculatedRefund
    }));
  }, [formData.product_id, formData.quantity, selectedSaleDetails, products]);

  // Update customer due balance when customer_id changes
  useEffect(() => {
    if (formData.customer_id) {
      const cust = customers.find(c => String(c.id) === String(formData.customer_id));
      if (cust) {
        setCustomerDueBalance(parseFloat(cust.due_balance || 0));
      } else {
        setCustomerDueBalance(0);
      }
    } else {
      setCustomerDueBalance(0);
      setFormData(prev => ({ ...prev, deduct_from_due: false }));
    }
  }, [formData.customer_id, customers]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.product_id || !formData.quantity || parseFloat(formData.refund_amount) < 0) {
      triggerAlert('error', 'Please fill in all required fields.');
      return;
    }

    const qtyVal = parseInt(formData.quantity);
    if (selectedProductDetails && qtyVal > selectedProductDetails.maxQty) {
      triggerAlert('error', `Cannot return more than purchased in this sale (Max: ${selectedProductDetails.maxQty}).`);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/returns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sale_id: formData.sale_id ? parseInt(formData.sale_id) : null,
          customer_id: formData.customer_id ? parseInt(formData.customer_id) : null,
          product_id: parseInt(formData.product_id),
          quantity: qtyVal,
          refund_amount: parseFloat(formData.refund_amount),
          notes: formData.notes,
          deduct_from_due: formData.deduct_from_due ? 1 : 0
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to record return transaction.');

      triggerAlert('success', 'Customer return successfully logged and stock adjusted!');
      setShowAddModal(false);
      resetForm();
      fetchReturns();
      fetchProducts();
      fetchCustomers();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleDelete = async (returnId) => {
    if (!window.confirm('Are you sure you want to void this return? This will deduct the returned quantity from the product stock.')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/returns/${returnId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to void return record.');

      triggerAlert('success', 'Return record voided and inventory reverted successfully!');
      fetchReturns();
      fetchProducts();
      fetchCustomers();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      sale_id: '',
      customer_id: '',
      product_id: '',
      quantity: '1',
      refund_amount: '0.00',
      notes: '',
      deduct_from_due: false
    });
    setSelectedSaleDetails(null);
    setSelectedProductDetails(null);
    setCustomerDueBalance(0);
  };

  const exportReturnsToCSV = () => {
    if (filteredReturns.length === 0) {
      triggerAlert('error', 'No returns to export in the current view.');
      return;
    }

    const headers = ['Return ID', 'Return Date', 'Product Name', 'Product SKU', 'Quantity Returned', 'Refund Amount', 'Refund Method', 'Customer', 'Reference Sale ID', 'Notes'];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredReturns.map(r => [
      r.id,
      `"${new Date(r.created_at).toLocaleString()}"`,
      escapeCSV(r.product_name),
      escapeCSV(r.product_sku),
      r.quantity,
      parseFloat(r.refund_amount || 0).toFixed(2),
      escapeCSV(r.deduct_from_due ? 'Store Credit' : 'Cash Refund'),
      escapeCSV(r.customer_name || 'Walk-in'),
      r.sale_id || 'N/A',
      escapeCSV(r.notes || '')
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `product_returns_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    triggerAlert('success', 'Product returns exported to CSV successfully!');
  };
  // HELPER FORMATTERS
  const formatCurrency = (val) => `৳${parseFloat(val).toFixed(2)}`;
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    }
    return new Date(dateStr).toLocaleDateString();
  };

  // Filtered returns for search bar
  const filteredReturns = returns.filter(r => {
    const searchLower = search.toLowerCase();
    return r.product_name.toLowerCase().includes(searchLower) ||
           r.product_sku.toLowerCase().includes(searchLower) ||
           (r.customer_name && r.customer_name.toLowerCase().includes(searchLower)) ||
           (r.notes && r.notes.toLowerCase().includes(searchLower));
  });

  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentReturns = filteredReturns.slice(indexOfFirstItem, indexOfLastItem);

  // KPIs
  const totalReturnedAmount = returns.reduce((sum, r) => sum + parseFloat(r.refund_amount), 0);
  const totalReturnedUnits = returns.reduce((sum, r) => sum + parseInt(r.quantity), 0);

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {alert && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center transition-all ${
          alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Customer Product Returns</h2>
          <p className="text-sm text-slate-500">Record customer product returns, auto-adjust inventory levels, and calculate return values</p>
        </div>
        <div className="flex items-center space-x-2">
            <button
                onClick={exportReturnsToCSV}
                className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 border border-slate-200 rounded-xl text-sm shadow-xs transition-colors flex items-center space-x-2"
            >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export CSV</span>
            </button>
            {!isSuperAdmin && (
            <button
                onClick={() => { resetForm(); setShowAddModal(true); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl text-sm shadow-sm transition-colors flex items-center space-x-2 w-full sm:w-auto justify-center"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Process Return</span>
            </button>
            )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-amber-50 text-amber-500 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Refunded Value</span>
          </div>
          <div className="mt-4">
            <span className="block text-2xl font-black text-slate-800">{formatCurrency(totalReturnedAmount)}</span>
            <span className="text-xs text-slate-450">Deductions dynamically registered in profits</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-50 text-indigo-500 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Returned Units</span>
          </div>
          <div className="mt-4">
            <span className="block text-2xl font-black text-slate-800">{totalReturnedUnits} Items</span>
            <span className="text-xs text-slate-450">Stock automatically added to catalog</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-slate-100 text-slate-500 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Logged Returns</span>
          </div>
          <div className="mt-4">
            <span className="block text-2xl font-black text-slate-800">{returns.length} Records</span>
            <span className="text-xs text-slate-450">Active customer returns logs</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search by product, SKU, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
          <div className="flex items-center space-x-2">
            <span>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-indigo-600 hover:text-indigo-855 font-bold ml-2 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="p-4 pl-6">Return Date</th>
                <th className="p-4">Product details</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Reference Sale ID</th>
                <th className="p-4">Qty Returned</th>
                <th className="p-4">Refund Amount</th>
                <th className="p-4">Refund Method</th>
                <th className="p-4">Reason / Notes</th>
                {!isSuperAdmin && <th className="p-4 text-center pr-6">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 9} className="p-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 9} className="p-12 text-center text-slate-400 font-medium">
                    No return records found.
                  </td>
                </tr>
              ) : (
                currentReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-semibold text-slate-700">{formatDate(r.created_at)}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{r.product_name}</div>
                      <div className="text-xs text-slate-400 font-mono">SKU: {r.product_sku}</div>
                    </td>
                    <td className="p-4 text-slate-700 font-medium">{r.customer_name || <span className="text-slate-400 italic">Walk-in Customer</span>}</td>
                    <td className="p-4 text-slate-700 font-medium">
                      {r.sale_id ? (
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-bold font-mono">
                          #{r.sale_id}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                    <td className="p-4 font-bold text-slate-800">+{r.quantity}</td>
                    <td className="p-4 font-black text-rose-600">{formatCurrency(r.refund_amount)}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                        r.deduct_from_due ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {r.deduct_from_due ? 'Store Credit' : 'Cash Refund'}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 italic max-w-xs truncate">{r.notes || '-'}</td>
                    {!isSuperAdmin && (
                      <td className="p-4 text-center pr-6">
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-rose-600 hover:text-rose-900 font-semibold text-xs border border-rose-105 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          Void & Revert Stock
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">
            Showing <span className="text-slate-800">{indexOfFirstItem + 1}</span> to <span className="text-slate-800">{Math.min(indexOfLastItem, filteredReturns.length)}</span> of <span className="text-slate-800">{filteredReturns.length}</span> entries
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-white hover:bg-slate-50 disabled:hover:bg-white disabled:opacity-50 text-slate-655 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                  currentPage === page
                    ? 'bg-indigo-650 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-655 border border-slate-200'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 bg-white hover:bg-slate-50 disabled:hover:bg-white disabled:opacity-50 text-slate-655 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Process Product Return</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-4">
              {/* Optional Sale ID Lookup */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Reference Sale ID (Optional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="sale_id"
                    placeholder="Enter Sale ID and tap blur to lookup..."
                    value={formData.sale_id}
                    onChange={handleInputChange}
                    onBlur={handleSaleIdBlur}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                  />
                  {saleLoading && (
                    <div className="absolute right-3 top-3">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-650"></div>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">If input, you can only return products in that invoice at the invoice price</p>
              </div>

              {/* Product Select */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Product to Return *
                </label>
                <select
                  name="product_id"
                  value={formData.product_id}
                  onChange={handleInputChange}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-slate-700"
                >
                  <option value="">-- Choose returned product --</option>
                  {selectedSaleDetails ? (
                    selectedSaleDetails.items?.map(i => (
                      <option key={i.product_id} value={i.product_id}>
                        {i.product_name} (SKU: {i.product_sku}) | Purchased Qty: {i.quantity} @ {formatCurrency(i.unit_price)}
                      </option>
                    ))
                  ) : (
                    products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (SKU: {p.sku}) | Price: {formatCurrency(p.price)} | Stock: {p.stock_quantity}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Customer Select */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Customer (Optional)
                </label>
                <select
                  name="customer_id"
                  value={formData.customer_id}
                  onChange={handleInputChange}
                  disabled={!!selectedSaleDetails?.customer_id}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-slate-700 disabled:bg-slate-100"
                >
                  <option value="">-- Select customer (Walk-in by default) --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || 'No phone'}) {parseFloat(c.due_balance) > 0 ? `| Due: ${formatCurrency(c.due_balance)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Qty & Auto-Calculated Refund */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    max={selectedProductDetails ? selectedProductDetails.maxQty : undefined}
                    value={formData.quantity}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                  {selectedProductDetails && selectedProductDetails.maxQty !== Infinity && (
                    <span className="text-[10px] text-amber-600 block mt-1 font-semibold">Max: {selectedProductDetails.maxQty} units</span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Refund Value
                  </label>
                  <input
                    type="text"
                    name="refund_amount"
                    readOnly
                    value={formData.refund_amount}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-slate-50 text-slate-750 font-bold outline-none"
                  />
                  <span className="text-[10px] text-slate-450 block mt-1 font-semibold">Calculated automatically</span>
                </div>
              </div>

              {/* Deduct from customer due toggle */}
              {customerDueBalance > 0 && (
                <div className="flex items-center p-3.5 bg-amber-50/50 border border-amber-200/50 rounded-xl">
                  <input
                    type="checkbox"
                    id="deduct_from_due"
                    name="deduct_from_due"
                    checked={formData.deduct_from_due}
                    onChange={handleInputChange}
                    className="h-4.5 w-4.5 text-indigo-650 focus:ring-indigo-500 border-slate-300 rounded"
                  />
                  <label htmlFor="deduct_from_due" className="ml-3 text-xs font-bold text-slate-700 cursor-pointer">
                    Deduct from Outstanding Due Balance (৳{customerDueBalance.toFixed(2)})
                  </label>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Reason for Return / Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="e.g. Customer return due to sizing issue / defect..."
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-655 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow"
                >
                  Process Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
