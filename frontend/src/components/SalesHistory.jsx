import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API_BASE_URL = 'http://localhost:5000/api';

export default function SalesHistory() {
  const [sales, setSales] = useState([]);
  const [heldBills, setHeldBills] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [chartType, setChartType] = useState('revenue'); // 'revenue' or 'sales'
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [search, setSearch] = useState('');
  const [productName, setProductName] = useState('');
  const [productDailySales, setProductDailySales] = useState(null);
  const [dailySalesLoading, setDailySalesLoading] = useState(false);
  
  // Modal viewer state
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleDetails, setSaleDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState('thermal'); // 'thermal' | 'regular'
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'shop_admin';
  const [selectedSaleIds, setSelectedSaleIds] = useState([]);

  // Profit breakdown modal state
  const [profitModal, setProfitModal] = useState(null); // { sale, details } | null
  const [profitLoading, setProfitLoading] = useState(false);

  const handlePrint = (mode) => {
    document.body.classList.add(`print-mode-${mode}`);
    window.print();
    setTimeout(() => {
      document.body.classList.remove(`print-mode-${mode}`);
    }, 500);
  };

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `${API_BASE_URL}/sales`;
      const params = [];
      if (startDate && endDate) {
        params.push(`start_date=${startDate}&end_date=${endDate}`);
      }
      if (productName) {
        params.push(`product_name=${encodeURIComponent(productName)}`);
      }
      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve sales log.');
      const data = await response.json();
      setSales(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductDailySales = async () => {
    if (!startDate || !endDate) {
      setProductDailySales(null);
      return;
    }
    setDailySalesLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/analytics/daily-products?start_date=${startDate}&end_date=${endDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Could not load daily product sales summary.');
      }
      const data = await response.json();
      setProductDailySales(data);
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setDailySalesLoading(false);
    }
  };

  const fetchHeldBills = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/held-bills`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHeldBills(data);
      }
    } catch (e) {
      console.error('Failed to fetch held bills in sales history', e);
    }
  };

  const fetchSaleDetails = async (saleId) => {
    setDetailsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/sales/${saleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load transaction details.');
      const data = await response.json();
      setSaleDetails(data);
    } catch (err) {
      alert(err.message);
      setSelectedSale(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    setSelectedSaleIds([]);
    fetchSales();
    fetchHeldBills();
    fetchProductDailySales();
  }, [startDate, endDate, productName]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedSaleIds([]);
  }, [search]);

  const openReceipt = (sale) => {
    setSelectedSale(sale);
    fetchSaleDetails(sale.id);
  };

  const openProfitModal = async (sale) => {
    setProfitModal({ sale, details: null });
    setProfitLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/sales/${sale.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load profit details.');
      const data = await response.json();
      setProfitModal({ sale, details: data });
    } catch (err) {
      triggerAlert('error', err.message);
      setProfitModal(null);
    } finally {
      setProfitLoading(false);
    }
  };

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm(`Are you sure you want to delete Sale #${saleId}?\n\nThis will:\n• Restore all product stock quantities\n• Reverse any customer due balance\n• Remove this transaction from all reports\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/sales/${saleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete sale.');

      triggerAlert('success', data.message);
      
      // Close receipt modal if this sale was being viewed
      if (selectedSale && selectedSale.id === saleId) {
        setSelectedSale(null);
        setSaleDetails(null);
      }

      // Refresh sales list (totals auto-adjust)
      fetchSales();
      fetchHeldBills();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleSelectAllToggle = (currentSales) => {
    const currentSaleIds = currentSales.map(s => s.id);
    const areAllCurrentPageSelected = currentSaleIds.length > 0 && currentSaleIds.every(id => selectedSaleIds.includes(id));
    if (areAllCurrentPageSelected) {
      setSelectedSaleIds(prev => prev.filter(id => !currentSaleIds.includes(id)));
    } else {
      setSelectedSaleIds(prev => {
        const union = new Set([...prev, ...currentSaleIds]);
        return Array.from(union);
      });
    }
  };

  const handleSelectToggle = (saleId) => {
    setSelectedSaleIds(prev =>
      prev.includes(saleId)
        ? prev.filter(id => id !== saleId)
        : [...prev, saleId]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedSaleIds.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete the ${selectedSaleIds.length} selected sales?\n\nThis will:\n• Restore all product stock quantities for these transactions\n• Reverse any customer due balances associated with them\n• Remove these transactions from all reports\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/sales/bulk-delete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ ids: selectedSaleIds })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete selected sales.');

      triggerAlert('success', data.message);
      setSelectedSaleIds([]);

      if (selectedSale && selectedSaleIds.includes(selectedSale.id)) {
        setSelectedSale(null);
        setSaleDetails(null);
      }

      fetchSales();
      fetchHeldBills();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const exportToCSV = () => {
    if (filteredSales.length === 0) {
      triggerAlert('error', 'No sales history to export.');
      return;
    }

    const headers = ['Invoice ID', 'Date', 'Products', 'Customer', 'Cashier', 'Payment Method', 'Total Amount', 'Paid Amount', 'Due Amount'];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredSales.map(sale => [
      sale.id,
      `"${new Date(sale.created_at).toLocaleString()}"`,
      escapeCSV(sale.product_names || ''),
      escapeCSV(sale.customer_name || 'Walk-in Customer'),
      escapeCSV(sale.staff_name),
      escapeCSV(sale.payment_method.replace('_', ' ')),
      parseFloat(sale.final_amount).toFixed(2),
      parseFloat(sale.paid_amount !== null && sale.paid_amount !== undefined ? sale.paid_amount : sale.final_amount || 0).toFixed(2),
      parseFloat(sale.due_amount || 0).toFixed(2)
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateSuffix = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `sales_history_${dateSuffix}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerAlert('success', 'Sales history exported successfully!');
  };

  const exportDueBillsToCSV = () => {
    const dueBills = heldBills.filter(b => b.status === 'held' && parseFloat(b.due_amount || 0) > 0);
    if (dueBills.length === 0) {
      triggerAlert('error', 'No due bills to export.');
      return;
    }

    const headers = ['Due Bill ID', 'Date Created', 'Original Sale ID', 'Customer', 'Cashier', 'Due Amount'];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = dueBills.map(bill => {
      const saleIdMatch = (bill.notes || '').match(/Sale #(\d+)/);
      const originalSaleId = saleIdMatch ? saleIdMatch[1] : 'N/A';

      return [
        bill.id,
        `"${new Date(bill.created_at).toLocaleString()}"`,
        originalSaleId,
        escapeCSV(bill.customer_name || 'Walk-in'),
        escapeCSV(bill.staff_name || 'N/A'),
        parseFloat(bill.due_amount || 0).toFixed(2)
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `due_bills_history_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerAlert('success', 'Due bills history exported successfully!');
  };

  // Computed summary stats
  const filteredSales = sales.filter((sale) => {
    const query = search.toLowerCase().trim();
    if (!query) return true;
    return (
      String(sale.id).includes(query) ||
      (sale.customer_name && sale.customer_name.toLowerCase().includes(query)) ||
      (sale.staff_name && sale.staff_name.toLowerCase().includes(query)) ||
      (sale.payment_method && sale.payment_method.toLowerCase().includes(query)) ||
      (sale.final_amount && String(sale.final_amount).includes(query))
    );
  });

  const totalSalesCount = filteredSales.length;
  const totalRevenue = filteredSales.reduce((sum, s) => sum + parseFloat(s.final_amount || 0), 0);
  const totalPaid = filteredSales.reduce((sum, s) => {
    const val = s.paid_amount !== null && s.paid_amount !== undefined ? s.paid_amount : (s.final_amount || 0);
    return sum + parseFloat(val || 0);
  }, 0);
  const totalDue = heldBills
    .filter(b => b.status === 'held' && parseFloat(b.due_amount || 0) > 0)
    .reduce((sum, b) => sum + parseFloat(b.due_amount || 0), 0);

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const indexOfLastSale = currentPage * itemsPerPage;
  const indexOfFirstSale = indexOfLastSale - itemsPerPage;
  const currentSales = filteredSales.slice(indexOfFirstSale, indexOfLastSale);

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

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Sales Transactions</h2>
          <p className="text-sm text-slate-500">Search and audit invoice histories, payment logs, and totals</p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={exportToCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-5 border border-slate-200 rounded-xl text-sm shadow-xs transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Date Filters bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-xs">
        <div className="flex items-center space-x-2">
          <label className="text-xs font-bold text-slate-500 uppercase">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-xs font-bold text-slate-500 uppercase">To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        {(startDate || endDate) && (
          <button
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="text-xs font-semibold text-rose-500 hover:text-rose-700 bg-rose-50 px-3 py-2 rounded-lg border border-rose-100 transition-colors"
          >
            Clear Filter
          </button>
        )}

        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px] max-w-md md:ml-auto">
          <input
            type="text"
            placeholder="Search by Invoice ID, customer, cashier, or method..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Daily Product Sales Summary */}
      {productDailySales && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50/50 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">Products Sold Summary</h3>
            <p className="text-xs text-slate-500">
              Aggregated view of all products sold between <span className="font-semibold text-indigo-600">{new Date(startDate).toLocaleDateString()}</span> and <span className="font-semibold text-indigo-600">{new Date(endDate).toLocaleDateString()}</span>.
            </p>
          </div>
          <div className="overflow-x-auto">
            {dailySalesLoading ? (
              <div className="p-12 text-center text-slate-400">Loading summary...</div>
            ) : productDailySales.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No products were sold in this period.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3 pl-4">SKU</th>
                    <th className="p-3">Product Name</th>
                    <th className="p-3 text-center">Total Quantity Sold</th>
                    <th className="p-3 text-right pr-4">Total Revenue Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {productDailySales.map(item => (
                    <tr key={item.product_id} className="hover:bg-slate-50/50">
                      <td className="p-3 pl-4 font-mono text-xs font-bold text-slate-500">{item.product_sku}</td>
                      <td className="p-3 font-semibold text-slate-800">{item.product_name}</td>
                      <td className="p-3 text-center">
                        <span className="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-100">
                          {item.total_quantity_sold} units
                        </span>
                      </td>
                      <td className="p-3 text-right pr-4 font-extrabold text-emerald-600">
                        ৳{parseFloat(item.total_revenue).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50/50 border-t border-slate-200 font-bold">
                    <td colSpan="2" className="p-3 pl-4 text-slate-500 uppercase text-xs">Total</td>
                    <td className="p-3 text-center text-indigo-800">
                      {productDailySales.reduce((sum, item) => sum + item.total_quantity_sold, 0)} units
                    </td>
                    <td className="p-3 text-right pr-4 text-emerald-700">
                      ৳{productDailySales.reduce((sum, item) => sum + parseFloat(item.total_revenue), 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}


      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Sales</p>
            <h3 className="text-xl font-extrabold text-slate-800">{totalSalesCount}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Revenue</p>
            <h3 className="text-xl font-extrabold text-indigo-600">৳{totalRevenue.toFixed(2)}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Collected</p>
            <h3 className="text-xl font-extrabold text-emerald-600">৳{totalPaid.toFixed(2)}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
          <div className={`p-2.5 rounded-xl ${totalDue > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Due</p>
            <h3 className={`text-xl font-extrabold ${totalDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>৳{totalDue.toFixed(2)}</h3>
          </div>
        </div>
      </div>

      {/* Dynamic Graph Chart */}
      {(() => {
        // Calculate dynamic trend data from the current loaded sales
        const trendMap = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          trendMap[dateStr] = { date: dateStr, revenue: 0, count: 0 };
        }

        filteredSales.forEach(sale => {
          const dateStr = new Date(sale.created_at).toISOString().split('T')[0];
          if (trendMap[dateStr]) {
            trendMap[dateStr].revenue += parseFloat(sale.final_amount || 0);
            trendMap[dateStr].count += 1;
          }
        });

        const chartData = Object.values(trendMap);
        const chartValues = chartData.map(d => chartType === 'revenue' ? d.revenue : d.count);
        const maxVal = Math.max(...chartValues, 5);

        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs relative">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Sales Transactions Trend</h3>
                <p className="text-xs text-slate-500">Chronological summary of successful sales volume and transaction count</p>
              </div>
              
              <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/60 self-end sm:self-auto">
                <button
                  onClick={() => setChartType('revenue')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartType === 'revenue'
                      ? 'bg-white text-indigo-650 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Revenue (৳)
                </button>
                <button
                  onClick={() => setChartType('sales')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartType === 'sales'
                      ? 'bg-white text-indigo-650 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Sales Volume
                </button>
              </div>
            </div>

            <div className="relative w-full h-[180px]">
              {/* SVG Plot */}
              <svg 
                viewBox="0 0 600 180" 
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = 15 + (1 - ratio) * 125;
                  const labelVal = ratio * maxVal;
                  return (
                    <g key={idx}>
                      <line 
                        x1={55} 
                        y1={y} 
                        x2={575} 
                        y2={y} 
                        stroke="#f1f5f9" 
                        strokeWidth="1.5"
                      />
                      <text 
                        x={43} 
                        y={y + 4} 
                        textAnchor="end" 
                        className="text-[10px] font-bold text-slate-400 fill-current font-sans"
                      >
                        {chartType === 'revenue' ? `৳${Math.round(labelVal)}` : Math.round(labelVal)}
                      </text>
                    </g>
                  );
                })}

                {/* Path Logic */}
                {(() => {
                  const chartPoints = chartData.map((d, index) => {
                    const val = chartType === 'revenue' ? d.revenue : d.count;
                    const x = 55 + (index * (600 - 55 - 25) / 6);
                    const y = 140 - ((val / maxVal) * 125);
                    return { x, y, val, date: d.date };
                  });

                  const linePath = chartPoints.reduce((path, pt, i) => {
                    return path + (i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`);
                  }, '');

                  const areaPath = `${linePath} L ${chartPoints[chartPoints.length - 1].x} 140 L ${chartPoints[0].x} 140 Z`;

                  return (
                    <>
                      <path d={areaPath} fill="url(#salesAreaGradient)" />
                      <path 
                        d={linePath} 
                        fill="none" 
                        stroke="#6366f1" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />

                      {chartPoints.map((pt, idx) => (
                        <g key={idx}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="15"
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredPoint({ ...pt, index: idx })}
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={hoveredPoint?.index === idx ? "5" : "3.5"}
                            fill={hoveredPoint?.index === idx ? "#6366f1" : "#ffffff"}
                            stroke="#6366f1"
                            strokeWidth={hoveredPoint?.index === idx ? "2.5" : "1.5"}
                            className="pointer-events-none transition-all duration-150"
                          />
                        </g>
                      ))}

                      {chartPoints.map((pt, idx) => {
                        const dateObj = new Date(pt.date);
                        const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        return (
                          <text
                            key={idx}
                            x={pt.x}
                            y={160}
                            textAnchor="middle"
                            className="text-[10px] font-bold text-slate-400 fill-current font-sans"
                          >
                            {label}
                          </text>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>

              {/* Tooltip */}
              {hoveredPoint && (
                <div
                  className="absolute bg-slate-900/95 backdrop-blur-md text-white rounded-xl p-2.5 shadow-xl border border-slate-700 pointer-events-none text-xs flex flex-col space-y-0.5 transition-all duration-75 z-10"
                  style={{
                    left: `${(hoveredPoint.x / 600) * 100}%`,
                    top: `${(hoveredPoint.y / 180) * 100 - 5}%`,
                    transform: 'translate(-50%, -100%)'
                  }}
                >
                  <span className="font-semibold text-slate-400">
                    {new Date(hoveredPoint.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="font-extrabold text-white text-sm">
                    {chartType === 'revenue' ? `Revenue: ৳${parseFloat(hoveredPoint.val).toFixed(2)}` : `Sales: ${hoveredPoint.val}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Bulk Action Bar */}
      {isAdmin && selectedSaleIds.length > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-xl animate-fade-in">
          <div className="flex items-center space-x-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-450 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span className="text-sm font-semibold">
              Selected <span className="font-extrabold text-rose-400">{selectedSaleIds.length}</span> transaction{selectedSaleIds.length > 1 ? 's' : ''} for deletion
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedSaleIds([])}
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-md transition-colors flex items-center space-x-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* Sales Logs Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-800">Outstanding Due Bills</h3>
              <p className="text-xs text-slate-500">List of all recorded due balances from sales transactions.</p>
            </div>
            <button
              onClick={exportDueBillsToCSV}
              className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 border border-slate-200 rounded-xl text-xs shadow-xs transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export Due Bills CSV</span>
            </button>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                {isAdmin && (
                  <th className="p-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={currentSales.length > 0 && currentSales.every(s => selectedSaleIds.includes(s.id))}
                      onChange={() => handleSelectAllToggle(currentSales)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                  </th>
                )}
                <th className="p-4">Invoice ID</th>
                <th className="p-4">Date</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Cashier</th>
                <th className="p-4">Method</th>
                <th className="p-4 text-right">Total Final</th>
                <th className="p-4 text-right">Paid</th>
                <th className="p-4 text-right">Due</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="11" className="p-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                    </div>
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan="11" className="p-12 text-center text-slate-400">
                    No matching sales transactions found.
                  </td>
                </tr>
              ) : (
                currentSales.map((sale) => (
                  <tr key={sale.id} className={`hover:bg-slate-50/50 transition-colors ${selectedSaleIds.includes(sale.id) ? 'bg-indigo-50/10' : ''}`}>
                    {isAdmin && (
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedSaleIds.includes(sale.id)}
                          onChange={() => handleSelectToggle(sale.id)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="p-4 font-semibold text-slate-700">#{sale.id}</td>
                    <td className="p-4 text-slate-500">{new Date(sale.created_at).toLocaleString()}</td>
                    <td className="p-4 text-slate-800 font-medium">{sale.customer_name || 'Walk-in Customer'}</td>
                    <td className="p-4 text-slate-600">{sale.staff_name}</td>
                    <td className="p-4">
                      <span className="capitalize px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                        {sale.payment_method.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 text-right font-extrabold text-indigo-600">৳{parseFloat(sale.final_amount).toFixed(2)}</td>
                    <td className="p-4 text-right">
                      <span className="text-emerald-700 font-bold text-xs">
                        ৳{parseFloat(sale.paid_amount !== null && sale.paid_amount !== undefined ? sale.paid_amount : sale.final_amount || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {parseFloat(sale.due_amount || 0) > 0 ? (
                        <span className="bg-rose-50 text-rose-700 text-xs font-bold px-2 py-0.5 rounded-lg border border-rose-100">
                          ৳{parseFloat(sale.due_amount || 0).toFixed(2)}
                        </span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-lg border border-emerald-100">
                          Paid ✓
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => openReceipt(sale)}
                          className="text-indigo-600 hover:text-indigo-900 font-semibold text-xs border border-indigo-100 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          View
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => openProfitModal(sale)}
                            className="text-emerald-600 hover:text-emerald-900 font-semibold text-xs border border-emerald-100 hover:bg-emerald-50 px-2.5 py-1 rounded-lg transition-colors flex items-center space-x-1"
                            title="View profit breakdown (Admin Only)"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            <span>Details</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSale(sale.id)}
                          className="text-rose-500 hover:text-rose-800 border border-rose-100 hover:bg-rose-50 p-1 rounded-lg transition-colors"
                          title="Delete this sale (Admin Only)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">
            Showing <span className="text-slate-800">{indexOfFirstSale + 1}</span> to <span className="text-slate-800">{Math.min(indexOfLastSale, sales.length)}</span> of <span className="text-slate-800">{sales.length}</span> entries
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-white hover:bg-slate-50 disabled:hover:bg-white disabled:opacity-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                  currentPage === page
                    ? 'bg-slate-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 bg-white hover:bg-slate-50 disabled:hover:bg-white disabled:opacity-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
      {/* --- PROFIT BREAKDOWN MODAL (ADMIN ONLY) --- */}
      {profitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-white font-extrabold text-base tracking-tight">Profit Breakdown</h2>
                  <p className="text-emerald-100 text-xs mt-0.5">Sale #{profitModal.sale.id} · {new Date(profitModal.sale.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <button
                onClick={() => setProfitModal(null)}
                className="text-white/70 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {profitLoading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-600"></div>
                  <p className="text-sm text-slate-400 font-medium">Loading profit data...</p>
                </div>
              ) : profitModal.details ? (() => {
                const items = profitModal.details.items || [];
                const totalCost    = items.reduce((s, i) => s + parseFloat(i.cost_price || 0) * i.quantity, 0);
                const totalRevenue = items.reduce((s, i) => s + parseFloat(i.unit_price || 0) * i.quantity, 0);
                const totalProfit  = totalRevenue - totalCost;
                const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0';

                return (
                  <>
                    {/* Per-product Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 mb-5">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3 text-center w-12">Qty</th>
                            <th className="px-4 py-3 text-right">Cost Price</th>
                            <th className="px-4 py-3 text-right">Selling Price</th>
                            <th className="px-4 py-3 text-right">Profit</th>
                            <th className="px-4 py-3 text-center w-20">Margin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map((item, idx) => {
                            const costPerUnit  = parseFloat(item.cost_price || 0);
                            const sellPerUnit  = parseFloat(item.unit_price || 0);
                            const qty          = item.quantity;
                            const totalCostRow = costPerUnit * qty;
                            const totalSellRow = sellPerUnit * qty;
                            const profitRow    = totalSellRow - totalCostRow;
                            const marginRow    = totalSellRow > 0 ? ((profitRow / totalSellRow) * 100).toFixed(1) : '0.0';
                            const isLoss       = profitRow < 0;

                            return (
                              <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-semibold text-slate-800">{item.product_name || item.name}</div>
                                  <div className="text-xs text-slate-400 font-mono mt-0.5">{item.product_sku || 'N/A'}</div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="font-bold text-slate-700">{qty}</span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="text-slate-600 font-medium">৳{totalCostRow.toFixed(2)}</div>
                                  <div className="text-xs text-slate-400">৳{costPerUnit.toFixed(2)}/unit</div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="text-slate-800 font-semibold">৳{totalSellRow.toFixed(2)}</div>
                                  <div className="text-xs text-slate-400">৳{sellPerUnit.toFixed(2)}/unit</div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`font-extrabold ${isLoss ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {isLoss ? '-' : '+'}৳{Math.abs(profitRow).toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    isLoss
                                      ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                      : parseFloat(marginRow) >= 20
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                                  }`}>
                                    {isLoss ? '' : ''}{marginRow}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary Totals */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Cost Price</p>
                        <p className="text-xl font-extrabold text-slate-700">৳{totalCost.toFixed(2)}</p>
                        <p className="text-xs text-slate-400 mt-1">What you paid</p>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Total Selling Price</p>
                        <p className="text-xl font-extrabold text-indigo-700">৳{totalRevenue.toFixed(2)}</p>
                        <p className="text-xs text-indigo-400 mt-1">What customer paid</p>
                      </div>
                      <div className={`border rounded-xl p-4 text-center ${totalProfit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          Total Profit
                        </p>
                        <p className={`text-xl font-extrabold ${totalProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {totalProfit >= 0 ? '+' : '-'}৳{Math.abs(totalProfit).toFixed(2)}
                        </p>
                        <p className={`text-xs mt-1 font-semibold ${totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {profitMargin}% margin
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-5 flex justify-end">
                      <button
                        onClick={() => setProfitModal(null)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-6 rounded-xl text-sm transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </>
                );
              })() : (
                <div className="py-16 text-center text-slate-400 text-sm">No data available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- DETAILED RECEIPT VIEWER MODAL --- */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
            
            {detailsLoading ? (
              <div className="flex-1 py-24 flex justify-center items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
              </div>
            ) : saleDetails ? (
              <>
                {/* Local normalization mapping */}
                {(() => {
                  const receipt = {
                    sale_id: saleDetails.id,
                    items: saleDetails.items || [],
                    subtotal: parseFloat(saleDetails.total_amount || 0),
                    discount: parseFloat(saleDetails.discount || 0),
                    tax: parseFloat(saleDetails.tax || 0),
                    total: parseFloat(saleDetails.final_amount || 0),
                    payment_method: saleDetails.payment_method,
                    created_at: new Date(saleDetails.created_at).toLocaleString(),
                    customer_name: saleDetails.customer_name || 'Walk-in Customer',
                    customer_phone: saleDetails.customer_phone || '',
                    customer_address: saleDetails.customer_address || '',
                    shop_name: saleDetails.shop_name || 'Boutique POS',
                    shop_phone: saleDetails.shop_phone || '',
                    shop_address: saleDetails.shop_address || '',
                    shop_email: saleDetails.shop_email || '',
                    staff_name: saleDetails.staff_name || 'Cashier',
                    reduce_due_amount: 0,
                    paid_amount: parseFloat(saleDetails.paid_amount !== undefined ? saleDetails.paid_amount : saleDetails.final_amount),
                    due_amount: parseFloat(saleDetails.due_amount || 0)
                  };

                  const taxRatePercent = receipt.subtotal > 0 
                    ? ((receipt.tax / receipt.subtotal) * 100).toFixed(1).replace(/\.0$/, '') 
                    : '10';

                  return (
                    <>
                      {/* Left Side: Receipt Live Preview Canvas */}
                      <div className="flex-1 bg-slate-100 p-6 flex flex-col items-center justify-center overflow-y-auto min-h-0">
                        <div className="w-full flex justify-between items-center mb-4">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Receipt Preview</span>
                          <span className="text-[10px] bg-slate-200 text-slate-600 font-semibold px-2 py-0.5 rounded-full uppercase">
                            {previewMode === 'thermal' ? 'Thermal 80mm Roll' : 'Regular A4 Sheet'}
                          </span>
                        </div>
                        
                        <div className="w-full py-4 flex justify-center items-start min-h-0 overflow-y-auto">
                          {previewMode === 'thermal' ? (
                            /* Thermal Receipt Mockup */
                            <div className="w-[320px] bg-white text-slate-800 shadow-lg p-6 font-mono text-[11px] leading-relaxed border-t-8 border-indigo-600 rounded-b-md">
                              <div className="text-center mb-4">
                                <h2 className="text-sm font-bold tracking-tight uppercase text-slate-950">{receipt.shop_name}</h2>
                                {receipt.shop_address && <p className="text-[10px] text-slate-500 mt-0.5">{receipt.shop_address}</p>}
                                {receipt.shop_phone && <p className="text-[10px] text-slate-500">Tel: {receipt.shop_phone}</p>}
                                {receipt.shop_email && <p className="text-[10px] text-slate-500">Email: {receipt.shop_email}</p>}
                                <p className="text-[9px] text-slate-400 mt-2 font-sans tracking-widest">*** TRANSACTION RECEIPT ***</p>
                              </div>
                              
                              <div className="border-b border-dashed border-slate-300 py-2 my-2 text-[10px] space-y-0.5 text-slate-600">
                                <div><span className="font-semibold text-slate-800">Sale ID:</span> #{receipt.sale_id}</div>
                                <div><span className="font-semibold text-slate-800">Date:</span> {receipt.created_at}</div>
                                <div><span className="font-semibold text-slate-800">Cashier:</span> {receipt.staff_name}</div>
                                <div><span className="font-semibold text-slate-800">Customer:</span> {receipt.customer_name}</div>
                                {receipt.customer_phone && <div><span className="font-semibold text-slate-800">Phone:</span> {receipt.customer_phone}</div>}
                              </div>

                              <table className="w-full text-left text-[10px] border-collapse">
                                <thead>
                                  <tr className="border-b border-dashed border-slate-300 font-bold text-slate-700">
                                    <th className="pb-1 text-left">Item</th>
                                    <th className="pb-1 text-center w-8">Qty</th>
                                    <th className="pb-1 text-center w-8">Unit</th>
                                    <th className="pb-1 text-right w-16">Price</th>
                                    <th className="pb-1 text-right w-20">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {receipt.items.map((item, idx) => (
                                    <tr key={idx} className="border-b border-dotted border-slate-100">
                                      <td className="py-2 pr-1 text-slate-800 break-words max-w-[90px]">
                                        <div>{item.product_name || item.name}</div>
                                      </td>
                                      <td className="py-2 text-center text-slate-600">{item.quantity}</td>
                                      <td className="py-2 text-center text-slate-500">{item.unit || 'pcs'}</td>
                                      <td className="py-2 text-right text-slate-600">৳{parseFloat(item.unit_price || item.price).toFixed(2)}</td>
                                      <td className="py-2 text-right font-semibold text-slate-800">
                                        ৳{((item.unit_price || item.price) * item.quantity).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              <div className="border-t border-dashed border-slate-300 pt-2.5 mt-2.5 text-[10px] space-y-1.5 text-slate-600">
                                <div className="flex justify-between">
                                  <span>Subtotal:</span>
                                  <span className="font-medium text-slate-800">৳{receipt.subtotal.toFixed(2)}</span>
                                </div>
                                {receipt.discount > 0 && (
                                  <div className="flex justify-between text-rose-500">
                                    <span>Discount:</span>
                                    <span>-৳{receipt.discount.toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span>Tax ({taxRatePercent}%):</span>
                                  <span className="font-medium text-slate-800">৳{receipt.tax.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-slate-900 border-t border-dotted border-slate-200 pt-1.5 text-[12px]">
                                  <span>Total Paid:</span>
                                  <span>৳{receipt.paid_amount.toFixed(2)}</span>
                                </div>
                                {receipt.due_amount > 0 && (
                                  <div className="flex justify-between font-bold text-rose-600 border-t border-dotted border-slate-200 pt-1 text-[11px]">
                                    <span>Outstanding Due:</span>
                                    <span>৳{receipt.due_amount.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>

                              <div className="text-center mt-6 pt-3 border-t border-dashed border-slate-300">
                                <p className="text-[10px] text-slate-600 uppercase font-semibold">Payment: {receipt.payment_method.replace('_', ' ')}</p>
                                <p className="text-[10px] font-bold text-slate-800 tracking-wider mt-2">*** THANK YOU ***</p>
                              </div>
                            </div>
                          ) : (
                            /* Regular A4 Sheet Mockup */
                            <div className="w-full max-w-[620px] bg-white text-slate-800 shadow-lg p-8 font-sans text-[11px] leading-relaxed border-t-8 border-indigo-600 rounded-b-md">
                              <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-4">
                                <div>
                                  <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">{receipt.shop_name}</h1>
                                  {receipt.shop_address && <p className="text-slate-500 mt-1 text-[10px]">{receipt.shop_address}</p>}
                                  <div className="text-slate-400 mt-0.5 text-[9px] space-x-2">
                                    {receipt.shop_phone && <span>Tel: {receipt.shop_phone}</span>}
                                    {receipt.shop_email && <span>Email: {receipt.shop_email}</span>}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <h2 className="text-sm font-black text-indigo-600 tracking-widest uppercase">INVOICE</h2>
                                  <p className="text-slate-500 mt-1 text-[10px]">Invoice ID: <span className="font-semibold text-slate-800">#{receipt.sale_id}</span></p>
                                  <p className="text-slate-400 text-[9px]">{receipt.created_at}</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg mb-4 text-[10px]">
                                <div>
                                  <h3 className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Billed To</h3>
                                  <div className="font-bold text-slate-800">{receipt.customer_name}</div>
                                  {receipt.customer_phone && <p className="text-slate-600 mt-0.5">Phone: {receipt.customer_phone}</p>}
                                  {receipt.customer_address && <p className="text-slate-600">Address: {receipt.customer_address}</p>}
                                </div>
                                <div>
                                  <h3 className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Billed By</h3>
                                  <div className="font-bold text-slate-800">{receipt.shop_name}</div>
                                  <p className="text-slate-600 mt-0.5">Cashier: {receipt.staff_name}</p>
                                  <p className="text-slate-600">Payment: <span className="uppercase text-[9px] font-bold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">{receipt.payment_method.replace('_', ' ')}</span></p>
                                </div>
                              </div>

                              <table className="w-full text-left border-collapse text-[10px]">
                                <thead>
                                  <tr className="border-b-2 border-slate-200 text-[9px] uppercase font-bold text-slate-500">
                                    <th className="pb-2 text-left">Item Description</th>
                                    <th className="pb-2 text-center w-16">SKU</th>
                                    <th className="pb-2 text-center w-12">Qty</th>
                                    <th className="pb-2 text-right w-20">Unit Price</th>
                                    <th className="pb-2 text-right w-20">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {receipt.items.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="py-2.5 font-semibold text-slate-800">{item.product_name || item.name}</td>
                                      <td className="py-2.5 text-center text-slate-400 text-[9px] font-mono">{item.product_sku || item.sku || 'N/A'}</td>
                                      <td className="py-2.5 text-center text-slate-600 font-medium">{item.quantity}</td>
                                      <td className="py-2.5 text-right text-slate-600">৳{parseFloat(item.unit_price || item.price).toFixed(2)}</td>
                                      <td className="py-2.5 text-right font-bold text-slate-900">
                                        ৳{((item.unit_price || item.price) * item.quantity).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              <div className="flex justify-end mt-4 border-t border-slate-100 pt-3">
                                <div className="w-56 space-y-1.5 text-slate-600 text-[10px]">
                                  <div className="flex justify-between">
                                    <span>Subtotal:</span>
                                    <span className="font-semibold text-slate-800">৳{receipt.subtotal.toFixed(2)}</span>
                                  </div>
                                  {receipt.discount > 0 && (
                                    <div className="flex justify-between text-rose-500">
                                      <span>Discount:</span>
                                      <span>-৳{receipt.discount.toFixed(2)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span>Tax ({taxRatePercent}%):</span>
                                    <span className="font-semibold text-slate-800">৳{receipt.tax.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between font-black text-indigo-600 border-t border-slate-255 pt-1.5 text-xs">
                                    <span>Total Paid:</span>
                                    <span>৳{receipt.paid_amount.toFixed(2)}</span>
                                  </div>
                                  {receipt.due_amount > 0 && (
                                    <div className="flex justify-between font-bold text-rose-600 border-t border-slate-200 pt-1">
                                      <span>Outstanding Due:</span>
                                      <span>৳{receipt.due_amount.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="text-center mt-8 pt-3 border-t border-slate-100 text-slate-400 text-[9px]">
                                <p>Thank you for shopping with us! Please contact us for any inquiries.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Side: Options & Actions Control Panel */}
                      <div className="w-full md:w-80 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-100 p-6 bg-slate-50">
                        <div>
                          <h3 className="text-lg font-extrabold text-slate-800">Invoice Viewer</h3>
                          <p className="text-xs text-slate-500 mt-1">Review transaction details and select format for print output:</p>

                          {/* Print Layout Selector */}
                          <div className="mt-5 space-y-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Receipt Format</span>
                            <div className="grid grid-cols-2 gap-2 bg-slate-200/60 p-1 rounded-xl">
                              <button
                                type="button"
                                onClick={() => setPreviewMode('thermal')}
                                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                                  previewMode === 'thermal' 
                                    ? 'bg-white text-indigo-700 shadow-sm' 
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                                }`}
                              >
                                Thermal (80mm)
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewMode('regular')}
                                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                                  previewMode === 'regular' 
                                    ? 'bg-white text-indigo-700 shadow-sm' 
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                                }`}
                              >
                                Regular (A4)
                              </button>
                            </div>
                          </div>

                          {/* Summary Metadata Card */}
                          <div className="mt-6 bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2.5 text-xs">
                            <div className="flex justify-between text-slate-500">
                              <span>Invoice ID:</span>
                              <span className="font-semibold text-slate-700">#{receipt.sale_id}</span>
                            </div>
                            <div className="flex justify-between text-slate-500">
                              <span>Payment Method:</span>
                              <span className="font-semibold text-slate-700 uppercase">{receipt.payment_method}</span>
                            </div>
                            <div className="flex justify-between text-slate-500 border-t border-slate-100 pt-2 mt-2">
                              <span>Total Paid:</span>
                              <span className="font-bold text-indigo-600">৳{receipt.paid_amount.toFixed(2)}</span>
                            </div>
                            {receipt.due_amount > 0 && (
                              <div className="flex justify-between text-rose-500 font-semibold">
                                <span>Outstanding Due:</span>
                                <span>৳{receipt.due_amount.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions Footer */}
                        <div className="mt-8 space-y-2">
                          <button
                            onClick={() => handlePrint(previewMode)}
                            className="w-full bg-slate-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 flex items-center justify-center space-x-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            <span>Print {previewMode === 'thermal' ? 'Thermal' : 'Regular A4'}</span>
                          </button>
                          
                          {/* Admin delete transaction */}
                          <button
                            onClick={() => handleDeleteSale(receipt.sale_id)}
                            className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center space-x-2"
                            title="Delete this transaction permanently"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete Transaction</span>
                          </button>
                          
                          <button
                            onClick={() => { setSelectedSale(null); setSaleDetails(null); }}
                            className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 rounded-xl text-sm transition-colors"
                          >
                            Close
                          </button>
                        </div>
                      </div>

                      {/* --- DYNAMIC PRINT AREA (OFF-SCREEN PORTAL FOR CLEAN INVOICE PRINTING) --- */}
                      {createPortal(
                        <div id="receipt-print-area">
                          {/* Thermal View Container */}
                          <div className="thermal-only">
                            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                              <h2 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 2px 0' }}>{receipt.shop_name}</h2>
                              {receipt.shop_address && <p style={{ margin: '0 0 2px 0', fontSize: '9px' }}>{receipt.shop_address}</p>}
                              <div style={{ fontSize: '9px', margin: '0 0 4px 0' }}>
                                {receipt.shop_phone && <span style={{ marginRight: '6px' }}>Tel: {receipt.shop_phone}</span>}
                                {receipt.shop_email && <span>Email: {receipt.shop_email}</span>}
                              </div>
                              <p style={{ margin: '4px 0 0 0', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.05em' }}>*** TRANSACTION RECEIPT ***</p>
                            </div>
                            
                            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '8px 0', fontSize: '9px', lineHeight: '1.3' }}>
                              <div><strong>Sale ID:</strong> #{receipt.sale_id}</div>
                              <div><strong>Date:</strong> {receipt.created_at}</div>
                              <div><strong>Cashier:</strong> {receipt.staff_name}</div>
                              <div><strong>Customer:</strong> {receipt.customer_name}</div>
                              {receipt.customer_phone && <div><strong>Phone:</strong> {receipt.customer_phone}</div>}
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', margin: '8px 0' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px dashed #000' }}>
                                  <th style={{ textAlign: 'left', paddingBottom: '3px' }}>Item</th>
                                  <th style={{ textAlign: 'center', paddingBottom: '3px', width: '25px' }}>Qty</th>
                                  <th style={{ textAlign: 'center', paddingBottom: '3px', width: '25px' }}>Unit</th>
                                  <th style={{ textAlign: 'right', paddingBottom: '3px', width: '55px' }}>Price</th>
                                  <th style={{ textAlign: 'right', paddingBottom: '3px', width: '60px' }}>Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {receipt.items.map((item, idx) => (
                                  <tr key={idx}>
                                    <td style={{ paddingTop: '3px', maxWidth: '90px', wordBreak: 'break-all' }}>
                                      {item.product_name || item.name}
                                    </td>
                                    <td style={{ textAlign: 'center', paddingTop: '3px' }}>{item.quantity}</td>
                                    <td style={{ textAlign: 'center', paddingTop: '3px', color: '#666' }}>{item.unit || 'pcs'}</td>
                                    <td style={{ textAlign: 'right', paddingTop: '3px' }}>৳{parseFloat(item.unit_price || item.price).toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', paddingTop: '3px' }}>৳{((item.unit_price || item.price) * item.quantity).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <div style={{ borderTop: '1px dashed #000', paddingTop: '4px', fontSize: '9px', lineHeight: '1.3' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Subtotal:</span>
                                <span>৳{receipt.subtotal.toFixed(2)}</span>
                              </div>
                              {receipt.discount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Discount:</span>
                                  <span>-৳{receipt.discount.toFixed(2)}</span>
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Tax ({taxRatePercent}%):</span>
                                <span>৳{receipt.tax.toFixed(2)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', borderTop: '1px dashed #000', paddingTop: '3px', marginTop: '3px' }}>
                                <span>Total Paid:</span>
                                <span>৳{receipt.paid_amount.toFixed(2)}</span>
                              </div>
                              {receipt.due_amount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', color: '#ef4444', borderTop: '1px dashed #000', paddingTop: '2px', marginTop: '2px' }}>
                                  <span>Outstanding Due:</span>
                                  <span>৳{receipt.due_amount.toFixed(2)}</span>
                                </div>
                              )}
                            </div>

                            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '9px' }}>
                              <p style={{ margin: '0 0 2px 0' }}>Payment: {receipt.payment_method.toUpperCase()}</p>
                              <p style={{ margin: '0', fontWeight: 'bold' }}>*** THANK YOU ***</p>
                            </div>
                          </div>

                          {/* Regular A4 View Container */}
                          <div className="regular-only">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
                              <div>
                                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 4px 0' }}>{receipt.shop_name}</h1>
                                {receipt.shop_address && <p style={{ margin: '0 0 2px 0', color: '#64748b', fontSize: '12px' }}>{receipt.shop_address}</p>}
                                <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                                  {receipt.shop_phone && <span style={{ marginRight: '10px' }}>Tel: {receipt.shop_phone}</span>}
                                  {receipt.shop_email && <span>Email: {receipt.shop_email}</span>}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#6366f1', margin: '0 0 4px 0' }}>INVOICE</h2>
                                <p style={{ margin: '0 0 2px 0', color: '#64748b', fontSize: '12px' }}><strong>Invoice ID:</strong> #{receipt.sale_id}</p>
                                <p style={{ margin: '0', color: '#64748b', fontSize: '12px' }}><strong>Date:</strong> {receipt.created_at}</p>
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', gap: '30px' }}>
                              <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                                <h3 style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Billed To</h3>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{receipt.customer_name}</div>
                                {receipt.customer_phone && <div style={{ color: '#475569', fontSize: '12px', marginBottom: '2px' }}>Phone: {receipt.customer_phone}</div>}
                                {receipt.customer_address && <div style={{ color: '#475569', fontSize: '12px' }}>Address: {receipt.customer_address}</div>}
                              </div>
                              <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                                <h3 style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Billed By</h3>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{receipt.shop_name}</div>
                                <div style={{ color: '#475569', fontSize: '12px', marginBottom: '2px' }}>Cashier: {receipt.staff_name}</div>
                                <div style={{ color: '#475569', fontSize: '12px' }}>Payment Method: {receipt.payment_method.toUpperCase()}</div>
                              </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontBold: 'true', textAlign: 'left' }}>
                                  <th style={{ padding: '8px 0' }}>Item Description</th>
                                  <th style={{ padding: '8px 0', textAlign: 'center', width: '100px' }}>SKU</th>
                                  <th style={{ padding: '8px 0', textAlign: 'center', width: '60px' }}>Qty</th>
                                  <th style={{ padding: '8px 0', textAlign: 'right', width: '100px' }}>Unit Price</th>
                                  <th style={{ padding: '8px 0', textAlign: 'right', width: '100px' }}>Total</th>
                                </tr>
                              </thead>
                              <tbody style={{ fontSize: '13px', color: '#334155' }}>
                                {receipt.items.map((item, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '10px 0', fontWeight: '500' }}>{item.product_name || item.name}</td>
                                    <td style={{ padding: '10px 0', textAlign: 'center', color: '#64748b' }}>{item.product_sku || item.sku || 'N/A'}</td>
                                    <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.quantity}</td>
                                    <td style={{ padding: '10px 0', textAlign: 'right' }}>৳{parseFloat(item.unit_price || item.price).toFixed(2)}</td>
                                    <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold' }}>৳{((item.unit_price || item.price) * item.quantity).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                              <div style={{ width: '250px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#64748b' }}>
                                  <span>Subtotal</span>
                                  <span style={{ fontWeight: '600', color: '#1e293b' }}>৳{receipt.subtotal.toFixed(2)}</span>
                                </div>
                                {receipt.discount > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#ef4444' }}>
                                    <span>Discount</span>
                                    <span>-৳{receipt.discount.toFixed(2)}</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#64748b' }}>
                                  <span>Tax ({taxRatePercent}%)</span>
                                  <span style={{ fontWeight: '600', color: '#1e293b' }}>৳{receipt.tax.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '15px', fontWeight: 'bold', borderTop: '2px solid #e2e8f0', marginTop: '6px' }}>
                                  <span>Total Paid</span>
                                  <span style={{ color: '#6366f1' }}>৳{receipt.paid_amount.toFixed(2)}</span>
                                </div>
                                {receipt.due_amount > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#ef4444', fontWeight: 'bold', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                                    <span>Outstanding Due</span>
                                    <span>৳{receipt.due_amount.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ marginTop: '60px', borderTop: '1px solid #e2e8f0', paddingTop: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                              <p style={{ margin: '0 0 3px 0' }}>Thank you for shopping with us!</p>
                              <p style={{ margin: '0' }}>Please contact us for any inquiry regarding this invoice.</p>
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
              <div className="p-12 text-center text-slate-400 flex-1">Failed to render details.</div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
