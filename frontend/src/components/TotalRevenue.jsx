import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE_URL = 'http://localhost:5000/api';

export default function TotalRevenue() {
  const userObj = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = userObj.role === 'super_admin';

  const [revenueData, setRevenueData] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');

  useEffect(() => {
    if (isSuperAdmin) {
      const fetchShops = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_BASE_URL}/shops`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            setShops(data);
          }
        } catch (err) {
          console.error('Failed to fetch shops:', err);
        }
      };
      fetchShops();
    }
  }, [isSuperAdmin]);

  const fetchRevenue = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      let url = `${API_BASE_URL}/analytics/revenue`;
      const queryParams = [];
      if (startDate) queryParams.push(`start_date=${startDate}`);
      if (endDate) queryParams.push(`end_date=${endDate}`);
      if (isSuperAdmin && selectedShopId) {
        queryParams.push(`shop_id=${selectedShopId}`);
      }

      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to retrieve financial analytics data.');
      }

      const data = await response.json();
      setRevenueData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevenue();
  }, [startDate, endDate, selectedShopId]);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const formatCurrency = (val) => {
    const numericVal = parseFloat(val || 0);
    return `৳${numericVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    }
    return new Date(dateStr).toLocaleDateString();
  };

  const exportToCSV = () => {
    if (!revenueData) {
      triggerAlert('error', 'No financial data to export.');
      return;
    }

    const headers = ['Financial Indicator', 'Category', 'Description', 'Amount (৳)'];
    const rows = [
      ['Sales Revenue (Accrual)', 'Inflow', 'Gross revenue generated from customer sales transactions', revenueData.sales_revenue.toFixed(2)],
      ['Sales Revenue (Cash Collected)', 'Inflow', 'Actual cash collected from sales transactions', revenueData.sales_cash_received.toFixed(2)],
      ['Customer Due Balance (Receivable)', 'Inflow', 'Total outstanding balance owed by customers', (revenueData.customer_due || 0).toFixed(2)],
      ['Customer Returns', 'Outflow', 'Total refund value of returned items by customers', (revenueData.customer_returns || 0).toFixed(2)],
      ['Cost of Goods Sold (COGS)', 'Outflow', 'Cost price value of stock sold to customers (adjusted for returns)', revenueData.cost_of_goods_sold.toFixed(2)],
      ['Product Purchasing Cost (Accrual)', 'Outflow', 'Total value of ordered and received purchase orders', revenueData.inventory_purchasing_cost.toFixed(2)],
      ['Product Purchasing Cost (Cash Paid)', 'Outflow', 'Actual cash paid out for purchase orders', revenueData.inventory_purchasing_cash_paid.toFixed(2)],
      ['Supplier Credit (Owed)', 'Outflow', 'Total outstanding payable balance owed to suppliers', (revenueData.supplier_due || 0).toFixed(2)],
      ['Other Costs', 'Outflow', 'Shop operational costs and miscellaneous overheads', revenueData.other_costs.toFixed(2)],
      ['Wastage & Damage Loss', 'Outflow', 'Cost of damaged, expired, or stolen items written off', (revenueData.wastage_loss || 0).toFixed(2)],
      ['Manual Sales Orders (Confirmed)', 'Inflow', 'Confirmed sales from manually collected salesman orders', (revenueData.manual_orders?.confirmed_value || 0).toFixed(2)],
      ['Manual Sales Orders (Pending Drafts)', 'Pending', 'Value of salesman order drafts currently in pending status', (revenueData.manual_orders?.pending_value || 0).toFixed(2)],
      ['Net Profit (Cashflow Basis)', 'Summary', 'Net cashflow liquid profit (Cash Collected - Cash Paid - Other Costs - Wastage Loss - Customer Returns)', revenueData.net_profit_cashflow.toFixed(2)],
      ['Net Profit (COGS Margin Basis)', 'Summary', 'Net trading margins profit (Sales - COGS - Other Costs - Wastage Loss - Customer Returns)', revenueData.net_profit_cogs.toFixed(2)]
    ];

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(e => e.map(val => {
        let str = String(val);
        if (/[",\n\r]/.test(str)) {
          str = `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    const selectedShop = shops.find(s => String(s.id) === String(selectedShopId));
    const shopNameSlug = selectedShop ? selectedShop.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'all_shops';
    const startStr = startDate ? startDate : 'all-time';
    const endStr = endDate ? endDate : 'all-time';
    link.setAttribute('download', `financial_report_${shopNameSlug}_${startStr}_to_${endStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerAlert('success', 'Financial report exported successfully!');
  };

  const exportToPDF = () => {
    if (!revenueData) {
      triggerAlert('error', 'No financial data to export.');
      return;
    }

    try {
      const doc = new jsPDF();
      const selectedShop = shops.find(s => String(s.id) === String(selectedShopId));
      const shopName = selectedShop ? selectedShop.name : 'All Shops';
      const startStr = startDate ? formatDate(startDate) : 'All Time';
      const endStr = endDate ? formatDate(endDate) : 'All Time';

      // Title
      doc.setFontSize(18);
      doc.text('Financial Report - Total Revenue & Profits', 14, 20);
      doc.setFontSize(10);
      doc.text(`Shop: ${shopName}`, 14, 28);
      doc.text(`Period: ${startStr} to ${endStr}`, 14, 34);

      // Main Financial Data Table
      const tableData = [
        ['Sales Revenue (Accrual)', formatCurrency(revenueData.sales_revenue), 'Inflow'],
        ['Sales Revenue (Cash Collected)', formatCurrency(revenueData.sales_cash_received), 'Inflow'],
        ['Customer Due Balance (Receivable)', formatCurrency(revenueData.customer_due || 0), 'Inflow'],
        ['Customer Returns', formatCurrency(revenueData.customer_returns || 0), 'Outflow'],
        ['Cost of Goods Sold (COGS)', formatCurrency(revenueData.cost_of_goods_sold), 'Outflow'],
        ['Product Purchasing Cost (Accrual)', formatCurrency(revenueData.inventory_purchasing_cost), 'Outflow'],
        ['Product Purchasing Cost (Cash Paid)', formatCurrency(revenueData.inventory_purchasing_cash_paid), 'Outflow'],
        ['Supplier Credit (Owed)', formatCurrency(revenueData.supplier_due || 0), 'Outflow'],
        ['Other Costs', formatCurrency(revenueData.other_costs), 'Outflow'],
        ['Wastage & Damage Loss', formatCurrency(revenueData.wastage_loss || 0), 'Outflow'],
        ['Manual Sales Orders (Confirmed)', formatCurrency(revenueData.manual_orders?.confirmed_value || 0), 'Inflow'],
        ['Manual Sales Orders (Pending)', formatCurrency(revenueData.manual_orders?.pending_value || 0), 'Pending']
      ];

      autoTable(doc, {
        head: [['Financial Indicator', 'Amount', 'Category']],
        body: tableData,
        startY: 42,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 35, halign: 'right' },
          2: { cellWidth: 25, halign: 'center' }
        },
        margin: { top: 42, right: 10, bottom: 20, left: 10 }
      });

      // Net Profit Summary
      const summaryY = doc.lastAutoTable.finalY + 15;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Net Profit Summary', 14, summaryY);
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');

      const summaryData = [
        ['Net Profit (Cashflow Basis)', formatCurrency(revenueData.net_profit_cashflow)],
        ['Net Profit (COGS Margin Basis)', formatCurrency(revenueData.net_profit_cogs)]
      ];

      const summaryHeadColor = revenueData.net_profit_cashflow >= 0 ? [16, 185, 129] : [239, 68, 68];

      autoTable(doc, {
        head: [['Metric', 'Amount']],
        body: summaryData,
        startY: summaryY + 5,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: summaryHeadColor, textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 35, halign: 'right' }
        },
        margin: { top: summaryY + 5, right: 10, bottom: 20, left: 10 }
      });

      // Footer
      const footerY = doc.lastAutoTable.finalY + 15;
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text('Generated on: ' + new Date().toLocaleString(), 14, footerY);

      const shopNameSlug = selectedShop ? selectedShop.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'all_shops';
      const startSlug = startDate ? startDate : 'all-time';
      const endSlug = endDate ? endDate : 'all-time';
      doc.save(`financial_report_${shopNameSlug}_${startSlug}_to_${endSlug}.pdf`);

      triggerAlert('success', 'Financial report PDF exported successfully!');
    } catch (err) {
      triggerAlert('error', 'Failed to generate PDF.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Alert Banner */}
      {alert && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center transition-all ${alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
          }`}>
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Total Revenue & Profits</h2>
          <p className="text-sm text-slate-500">Comprehensive overview of sales, buying costs, operational costs, and profitability analysis</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={exportToCSV}
            disabled={loading || !revenueData}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-5 border border-slate-200 rounded-xl text-sm shadow-xs transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>CSV</span>
          </button>
          <button
            onClick={exportToPDF}
            disabled={loading || !revenueData}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-5 border border-slate-200 rounded-xl text-sm shadow-xs transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Date Filters Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center space-x-2 text-slate-600 font-semibold text-sm">
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Filter Report Period:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
          {isSuperAdmin && (
            <div className="flex items-center space-x-2 mr-4">
              <span className="text-slate-500">Tenant Shop:</span>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
              >
                <option value="">All Shops (Consolidated)</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <span>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-700"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-700"
            />
          </div>
          {(startDate || endDate || (isSuperAdmin && selectedShopId)) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); setSelectedShopId(''); }}
              className="text-indigo-600 hover:text-indigo-850 font-bold ml-2 underline"
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-700 text-sm flex items-center space-x-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-24 text-center shadow-xs">
          <div className="flex justify-center items-center flex-col space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
            <p className="text-slate-500 text-sm font-medium">Aggregating financial statements...</p>
          </div>
        </div>
      ) : revenueData ? (
        <div className="space-y-6">
          {/* Main KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">

            {/* Sales Revenue Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sales Revenue</span>
                <div className="p-2.5 bg-emerald-50 text-emerald-500 rounded-xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <span className="block text-2xl font-black text-slate-800">{formatCurrency(revenueData.sales_revenue)}</span>
                <span className="text-xs font-bold text-emerald-600 mt-1 block">Cash Collected: {formatCurrency(revenueData.sales_cash_received)}</span>
                <span className="text-xs font-bold text-rose-600 mt-1 block">Due Balance (Receivable): {formatCurrency(revenueData.customer_due)}</span>
                <span className="text-xs text-slate-455 mt-1 block">From {revenueData.sales_count} sales transactions</span>
              </div>
            </div>

            {/* Customer Returns Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer Returns</span>
                <div className="p-2.5 bg-rose-50 text-rose-500 rounded-xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-3a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m-9 5h1a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <span className="block text-2xl font-black text-rose-600">{formatCurrency(revenueData.customer_returns || 0)}</span>
                <span className="text-xs text-slate-450 mt-1 block">Total customer refund/credit value</span>
              </div>
            </div>

            {/* Buying Costs Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Product Purchase Cost</span>
                <div className="p-2.5 bg-rose-50 text-rose-500 rounded-xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <span className="block text-2xl font-black text-slate-800">{formatCurrency(revenueData.inventory_purchasing_cost)}</span>
                <span className="text-xs font-bold text-rose-600 mt-1 block">Cash Paid: {formatCurrency(revenueData.inventory_purchasing_cash_paid)}</span>
                <span className="text-xs font-bold text-amber-600 mt-1 block">Credit (Owed): {formatCurrency(revenueData.supplier_due)}</span>
                <span className="text-xs text-slate-450 mt-1 block">Value of active purchase orders</span>
              </div>
            </div>

            {/* Other Cost Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Other costs (Overhead)</span>
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <span className="block text-2xl font-black text-slate-800">{formatCurrency(revenueData.other_costs)}</span>
                <span className="text-xs text-slate-455 mt-1 block">Overhead/miscellaneous expenses</span>
              </div>
            </div>

            {/* Wastage Loss Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Wastage & Damage Loss</span>
                <div className="p-2.5 bg-rose-50 text-rose-500 rounded-xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <span className="block text-2xl font-black text-slate-800">{formatCurrency(revenueData.wastage_loss || 0)}</span>
                <span className="text-xs text-slate-450 mt-1 block">Value of stock adjustments/damage</span>
              </div>
            </div>

            {/* Net Cashflow Profit Card */}
            <div className={`border rounded-2xl p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between ${revenueData.net_profit_cashflow >= 0
              ? 'bg-emerald-50/40 border-emerald-200 text-emerald-800'
              : 'bg-rose-50/40 border-rose-200 text-rose-800'
              }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-455 uppercase tracking-wider">Net Profit (Cashflow)</span>
                <div className={`p-2.5 rounded-xl ${revenueData.net_profit_cashflow >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                  }`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <span className="block text-2xl font-black">{formatCurrency(revenueData.net_profit_cashflow)}</span>
                <span className="text-xs opacity-75 mt-1 block">Based on liquid cash transactions</span>
              </div>
            </div>

          </div>

          {/* Two profit breakdown boxes side-by-side (Net cashflow profit vs Trading margin COGS profit) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Profitability COGS Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                    <span>Trading Profitability (COGS Basis)</span>
                  </h3>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    Accrual Margin
                  </span>
                </div>

                <div className="space-y-3.5 mt-5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Sales Revenue:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(revenueData.sales_revenue)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Total Sold (TS):</span>
                    <span className="font-bold text-rose-600">-{formatCurrency(revenueData.cost_of_goods_sold)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Other Operational Costs:</span>
                    <span className="font-bold text-rose-600">-{formatCurrency(revenueData.other_costs)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Wastage & Damage Loss:</span>
                    <span className="font-bold text-rose-600">-{formatCurrency(revenueData.wastage_loss || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Customer Returns:</span>
                    <span className="font-bold text-rose-600">-{formatCurrency(revenueData.customer_returns || 0)}</span>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Net Profit (Trading):</span>
                    <span className={`text-lg font-black ${revenueData.net_profit_cogs >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                      {formatCurrency(revenueData.net_profit_cogs)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dynamic Line Chart */}
              {(() => {
                const trend = revenueData?.trend || [];
                if (trend.length === 0) return null;

                const vals = trend.map(t => parseFloat(t.net_profit_cogs || 0));
                const maxVal = Math.max(...vals, 1000);
                const minVal = Math.min(...vals, 0);
                const valRange = maxVal - minVal || 1;

                const svgWidth = 400;
                const svgHeight = 130;
                const paddingLeft = 50;
                const paddingRight = 15;
                const paddingTop = 15;
                const paddingBottom = 25;

                const chartPoints = trend.map((t, index) => {
                  const val = parseFloat(t.net_profit_cogs || 0);
                  const x = paddingLeft + (index * (svgWidth - paddingLeft - paddingRight) / (trend.length - 1 || 1));
                  const y = svgHeight - paddingBottom - (((val - minVal) / valRange) * (svgHeight - paddingTop - paddingBottom));
                  return { x, y, val, date: t.date };
                });

                const linePath = chartPoints.reduce((path, pt, i) => {
                  return path + (i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`);
                }, '');

                return (
                  <div className="mt-5 border border-slate-100 rounded-xl p-3 bg-slate-50/50 relative">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Line Chart (Profit Trend)</span>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">7 Days</span>
                    </div>

                    <div className="relative w-full h-[110px]">
                      <svg
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        className="w-full h-full overflow-visible"
                        preserveAspectRatio="none"
                      >
                        {/* Zero Line if negative numbers exist */}
                        {minVal < 0 && (
                          (() => {
                            const zeroY = svgHeight - paddingBottom - (((0 - minVal) / valRange) * (svgHeight - paddingTop - paddingBottom));
                            return (
                              <line
                                x1={paddingLeft}
                                y1={zeroY}
                                x2={svgWidth - paddingRight}
                                y2={zeroY}
                                stroke="#cbd5e1"
                                strokeWidth="1"
                                strokeDasharray="3 3"
                              />
                            );
                          })()
                        )}

                        {/* Line Path */}
                        <path
                          d={linePath}
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Interactive dots */}
                        {chartPoints.map((pt, idx) => (
                          <g key={idx}>
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r="12"
                              fill="transparent"
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredPoint({ ...pt, index: idx })}
                              onMouseLeave={() => setHoveredPoint(null)}
                            />
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={hoveredPoint?.index === idx ? "4.5" : "3"}
                              fill={hoveredPoint?.index === idx ? "#6366f1" : "#ffffff"}
                              stroke="#6366f1"
                              strokeWidth={hoveredPoint?.index === idx ? "2" : "1.5"}
                              className="pointer-events-none transition-all duration-150"
                            />
                          </g>
                        ))}

                        {/* X-Axis labels */}
                        {chartPoints.map((pt, idx) => {
                          const dateObj = new Date(pt.date);
                          const label = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                          return (
                            <text
                              key={idx}
                              x={pt.x}
                              y={svgHeight - 6}
                              textAnchor="middle"
                              className="text-[8px] font-bold text-slate-400 fill-current font-sans"
                            >
                              {label}
                            </text>
                          );
                        })}

                        {/* Y-Axis Min/Max labels */}
                        <text
                          x={paddingLeft - 8}
                          y={paddingTop + 6}
                          textAnchor="end"
                          className="text-[8px] font-extrabold text-slate-400 fill-current font-sans"
                        >
                          ৳{Math.round(maxVal)}
                        </text>
                        <text
                          x={paddingLeft - 8}
                          y={svgHeight - paddingBottom}
                          textAnchor="end"
                          className="text-[8px] font-extrabold text-slate-400 fill-current font-sans"
                        >
                          ৳{Math.round(minVal)}
                        </text>
                      </svg>

                      {/* Tooltip */}
                      {hoveredPoint && (
                        <div
                          className="absolute bg-slate-900/95 backdrop-blur-md text-white rounded-lg p-2 shadow-lg border border-slate-700 pointer-events-none text-[10px] flex flex-col space-y-0.5 transition-all duration-75 z-10"
                          style={{
                            left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                            top: `${(hoveredPoint.y / svgHeight) * 100 - 5}%`,
                            transform: 'translate(-50%, -100%)'
                          }}
                        >
                          <span className="font-semibold text-slate-400">
                            {new Date(hoveredPoint.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="font-extrabold text-white">
                            Profit: ৳{parseFloat(hoveredPoint.val).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50/50 rounded-xl p-3 text-xs text-slate-500">
                <span className="font-bold text-slate-700 block mb-0.5">What is COGS Basis?</span>
                Measures trading profitability by subtracting the *original cost price* of items actually sold and wastage write-off value, rather than raw purchasing expenditure. Gives you the exact sales margin.
              </div>
            </div>

            {/* Profitability Cashflow Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span>Net Cash Flow (Cashflow Basis)</span>
                  </h3>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    Liquidity Flow
                  </span>
                </div>

                <div className="space-y-3.5 mt-5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Cash Collected (Sales):</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(revenueData.sales_cash_received)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Cash Paid (POs):</span>
                    <span className="font-bold text-rose-600">-{formatCurrency(revenueData.inventory_purchasing_cash_paid)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Other Operational Costs:</span>
                    <span className="font-bold text-rose-600">-{formatCurrency(revenueData.other_costs)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Wastage & Damage Loss:</span>
                    <span className="font-bold text-rose-600">-{formatCurrency(revenueData.wastage_loss || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Customer Returns:</span>
                    <span className="font-bold text-rose-600">-{formatCurrency(revenueData.customer_returns || 0)}</span>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Net Profit (Cashflow):</span>
                    <span className={`text-lg font-black ${revenueData.net_profit_cashflow >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                      {formatCurrency(revenueData.net_profit_cashflow)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dynamic Bar Chart */}
              {(() => {
                const trend = revenueData?.trend || [];
                if (trend.length === 0) return null;

                const vals = trend.map(t => parseFloat(t.net_profit_cashflow || 0));
                const maxVal = Math.max(...vals, 1000);
                const minVal = Math.min(...vals, 0);
                const valRange = maxVal - minVal || 1;

                const svgWidth = 400;
                const svgHeight = 130;
                const paddingLeft = 50;
                const paddingRight = 15;
                const paddingTop = 15;
                const paddingBottom = 25;

                const zeroY = svgHeight - paddingBottom - (((0 - minVal) / valRange) * (svgHeight - paddingTop - paddingBottom));
                const availableWidth = svgWidth - paddingLeft - paddingRight;
                const colWidth = availableWidth / trend.length;
                const barWidth = 20;

                const chartBars = trend.map((t, index) => {
                  const val = parseFloat(t.net_profit_cashflow || 0);
                  const x = paddingLeft + (index * colWidth) + (colWidth - barWidth) / 2;
                  const yVal = svgHeight - paddingBottom - (((val - minVal) / valRange) * (svgHeight - paddingTop - paddingBottom));

                  let y, height, isPositive;
                  if (val >= 0) {
                    y = yVal;
                    height = zeroY - yVal;
                    isPositive = true;
                  } else {
                    y = zeroY;
                    height = yVal - zeroY;
                    isPositive = false;
                  }

                  return { x, y, height, val, date: t.date, isPositive };
                });

                return (
                  <div className="mt-5 border border-slate-100 rounded-xl p-3 bg-slate-50/50 relative">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bar Chart (Cashflow Trend)</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">7 Days</span>
                    </div>

                    <div className="relative w-full h-[110px]">
                      <svg
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        className="w-full h-full overflow-visible"
                        preserveAspectRatio="none"
                      >
                        {/* Zero Line */}
                        <line
                          x1={paddingLeft}
                          y1={zeroY}
                          x2={svgWidth - paddingRight}
                          y2={zeroY}
                          stroke="#cbd5e1"
                          strokeWidth="1.5"
                        />

                        {/* Bars */}
                        {chartBars.map((bar, idx) => (
                          <g key={idx}>
                            {/* Interactive Bar Catcher */}
                            <rect
                              x={paddingLeft + (idx * colWidth)}
                              y={paddingTop}
                              width={colWidth}
                              height={svgHeight - paddingTop - paddingBottom}
                              fill="transparent"
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredPoint({ ...bar, index: idx })}
                              onMouseLeave={() => setHoveredPoint(null)}
                            />
                            {/* Visual Bar */}
                            <rect
                              x={bar.x}
                              y={bar.y}
                              width={barWidth}
                              height={Math.max(bar.height, 2)}
                              rx="2"
                              fill={bar.isPositive ? "#10b981" : "#f43f5e"}
                              className="pointer-events-none transition-all duration-150"
                              opacity={hoveredPoint?.index === idx ? "0.9" : "0.75"}
                            />
                          </g>
                        ))}

                        {/* X-Axis labels */}
                        {chartBars.map((bar, idx) => {
                          const dateObj = new Date(bar.date);
                          const label = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                          return (
                            <text
                              key={idx}
                              x={bar.x + barWidth / 2}
                              y={svgHeight - 6}
                              textAnchor="middle"
                              className="text-[8px] font-bold text-slate-400 fill-current font-sans"
                            >
                              {label}
                            </text>
                          );
                        })}

                        {/* Y-Axis Min/Max labels */}
                        <text
                          x={paddingLeft - 8}
                          y={paddingTop + 6}
                          textAnchor="end"
                          className="text-[8px] font-extrabold text-slate-400 fill-current font-sans"
                        >
                          ৳{Math.round(maxVal)}
                        </text>
                        <text
                          x={paddingLeft - 8}
                          y={svgHeight - paddingBottom}
                          textAnchor="end"
                          className="text-[8px] font-extrabold text-slate-400 fill-current font-sans"
                        >
                          ৳{Math.round(minVal)}
                        </text>
                      </svg>

                      {/* Tooltip */}
                      {hoveredPoint && (
                        <div
                          className="absolute bg-slate-900/95 backdrop-blur-md text-white rounded-lg p-2 shadow-lg border border-slate-700 pointer-events-none text-[10px] flex flex-col space-y-0.5 transition-all duration-75 z-10"
                          style={{
                            left: `${((hoveredPoint.x + barWidth / 2) / svgWidth) * 100}%`,
                            top: `${(hoveredPoint.y / svgHeight) * 100 - 5}%`,
                            transform: 'translate(-50%, -100%)'
                          }}
                        >
                          <span className="font-semibold text-slate-400">
                            {new Date(hoveredPoint.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="font-extrabold text-white">
                            Flow: ৳{parseFloat(hoveredPoint.val).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50/50 rounded-xl p-3 text-xs text-slate-500">
                <span className="font-bold text-slate-700 block mb-0.5">What is Cashflow Basis?</span>
                Reflects cash flow liquidity by subtracting the actual *buying cost* of all stocked products purchased during this period and wastage write-offs. Indicates the physical cash status of your shop.
              </div>
            </div>

          </div>

          {/* Slices Visualization Grid (Doughnut & Pie Charts) */}
          {(() => {
            if (!revenueData) return null;

            const sales = parseFloat(revenueData.sales_revenue || 0);
            const cogs = parseFloat(revenueData.cost_of_goods_sold || 0);
            const other = parseFloat(revenueData.other_costs || 0);
            const wastage = parseFloat(revenueData.wastage_loss || 0);
            const profit = parseFloat(revenueData.net_profit_cogs || 0);

            const totalExpenses = cogs + other + wastage;
            const tradingRevenueTotal = Math.max(sales, cogs + other + wastage + (profit > 0 ? profit : 0), 1);

            // Pie Chart Slices (Revenue Breakdown)
            const pieSlices = [
              { label: 'Net Trading Profit', val: profit > 0 ? profit : 0, color: '#10b981' },
              { label: 'Total Sold(TS)', val: cogs, color: '#6366f1' },
              { label: 'Other Costs', val: other, color: '#f59e0b' },
              { label: 'Wastage Loss', val: wastage, color: '#f43f5e' }
            ].filter(s => s.val > 0);

            const totalPieVal = pieSlices.reduce((sum, s) => sum + s.val, 0) || 1;
            pieSlices.forEach(s => s.percent = s.val / totalPieVal);

            // Doughnut Chart Slices (Expense Breakdown)
            const doughnutSlices = [
              { label: 'Cost of Goods (COGS)', val: cogs, color: '#6366f1' },
              { label: 'Other Costs', val: other, color: '#f59e0b' },
              { label: 'Wastage Loss', val: wastage, color: '#ef4444' }
            ].filter(s => s.val > 0);

            const totalDoughnutVal = doughnutSlices.reduce((sum, s) => sum + s.val, 0) || 1;
            doughnutSlices.forEach(s => s.percent = s.val / totalDoughnutVal);

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 1. Revenues vs Costs Structure (Pie Chart) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base mb-1">Revenue Structure</h3>
                    <p className="text-xs text-slate-450 mb-6">Distribution of gross sales revenue</p>

                    <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
                      {/* SVG Canvas */}
                      <div className="relative w-36 h-36 shrink-0">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                          {pieSlices.length === 0 ? (
                            <circle cx="18" cy="18" r="15.915" fill="#f1f5f9" />
                          ) : (
                            (() => {
                              let accumulated = 0;
                              return pieSlices.map((slice, idx) => {
                                const percentage = slice.percent * 100;
                                const strokeDasharray = `${percentage} ${100 - percentage}`;
                                const strokeDashoffset = -accumulated;
                                accumulated += percentage;
                                const isHovered = hoveredSlice?.chart === 'pie' && hoveredSlice?.index === idx;

                                return (
                                  <circle
                                    key={idx}
                                    cx="18"
                                    cy="18"
                                    r="15.915"
                                    fill="transparent"
                                    stroke={slice.color}
                                    strokeWidth={isHovered ? "34" : "32"}
                                    strokeDasharray={strokeDasharray}
                                    strokeDashoffset={strokeDashoffset}
                                    className="cursor-pointer transition-all duration-200"
                                    onMouseEnter={() => setHoveredSlice({ chart: 'pie', index: idx, ...slice })}
                                    onMouseLeave={() => setHoveredSlice(null)}
                                  />
                                );
                              });
                            })()
                          )}
                        </svg>
                      </div>

                      {/* Legends */}
                      <div className="flex-1 space-y-2 w-full">
                        {pieSlices.map((slice, idx) => {
                          const isHovered = hoveredSlice?.chart === 'pie' && hoveredSlice?.index === idx;
                          return (
                            <div
                              key={idx}
                              className={`flex justify-between items-center text-xs p-1.5 rounded-lg transition-colors ${isHovered ? 'bg-slate-50' : ''}`}
                              onMouseEnter={() => setHoveredSlice({ chart: 'pie', index: idx, ...slice })}
                              onMouseLeave={() => setHoveredSlice(null)}
                            >
                              <div className="flex items-center space-x-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }}></span>
                                <span className={`font-medium ${isHovered ? 'text-slate-800 font-bold' : 'text-slate-600'}`}>{slice.label}</span>
                              </div>
                              <span className="font-bold text-slate-855">{(slice.percent * 100).toFixed(1)}%</span>
                            </div>
                          );
                        })}
                        {pieSlices.length === 0 && <div className="text-xs text-slate-400 italic">No revenue data to display.</div>}
                      </div>
                    </div>
                  </div>

                  {hoveredSlice?.chart === 'pie' && (
                    <div className="mt-4 p-2 bg-indigo-50/40 border border-indigo-100/50 rounded-xl text-center text-xs">
                      <span className="font-semibold text-slate-500">{hoveredSlice.label}:</span>
                      <span className="font-extrabold text-indigo-700">{formatCurrency(hoveredSlice.val)}</span>
                    </div>
                  )}
                </div>

                {/* 2. Expenses Allocation Breakdown (Doughnut Chart) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base mb-1">Expense Allocation</h3>
                    <p className="text-xs text-slate-450 mb-6">Split of outgoing costs and write-offs</p>

                    <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
                      {/* SVG Canvas */}
                      <div className="relative w-36 h-36 shrink-0">
                        <svg viewBox="0 0 36 36" className="w-full h-full">
                          <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e2e8f0" strokeWidth="3.8" />
                          {doughnutSlices.length === 0 ? (
                            <circle cx="18" cy="18" r="15.915" fill="#f1f5f9" strokeWidth="3.8" />
                          ) : (
                            <>
                              {(() => {
                                let accumulated = 0;
                                return doughnutSlices.map((slice, idx) => {
                                  const percentage = slice.percent * 100;
                                  const strokeDasharray = `${percentage} ${100 - percentage}`;
                                  const strokeDashoffset = 25 - accumulated;
                                  accumulated += percentage;
                                  const isHovered = hoveredSlice?.chart === 'doughnut' && hoveredSlice?.index === idx;

                                  return (
                                    <circle
                                      key={idx}
                                      cx="18"
                                      cy="18"
                                      r="15.915"
                                      fill="none"
                                      stroke={slice.color}
                                      strokeWidth={isHovered ? "4.2" : "3.8"}
                                      strokeDasharray={strokeDasharray}
                                      strokeDashoffset={strokeDashoffset}
                                      strokeLinecap="round"
                                      className="cursor-pointer transition-all duration-200"
                                      onMouseEnter={() => setHoveredSlice({ chart: 'doughnut', index: idx, ...slice })}
                                      onMouseLeave={() => setHoveredSlice(null)}
                                    />
                                  );
                                });
                              })()}
                            </>
                          )}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Spent</span>
                          <span className="text-base font-black text-slate-700">৳{Math.round(totalExpenses)}</span>
                        </div>
                      </div>

                      {/* Legends */}
                      <div className="flex-1 space-y-2 w-full">
                        {doughnutSlices.map((slice, idx) => {
                          const isHovered = hoveredSlice?.chart === 'doughnut' && hoveredSlice?.index === idx;
                          return (
                            <div
                              key={idx}
                              className={`flex justify-between items-center text-xs p-1.5 rounded-lg transition-colors ${isHovered ? 'bg-slate-50' : ''}`}
                              onMouseEnter={() => setHoveredSlice({ chart: 'doughnut', index: idx, ...slice })}
                              onMouseLeave={() => setHoveredSlice(null)}
                            >
                              <div className="flex items-center space-x-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }}></span>
                                <span className={`font-medium ${isHovered ? 'text-slate-800 font-bold' : 'text-slate-600'}`}>{slice.label}</span>
                              </div>
                              <span className="font-bold text-slate-855">{(slice.percent * 100).toFixed(1)}%</span>
                            </div>
                          );
                        })}
                        {doughnutSlices.length === 0 && <div className="text-xs text-slate-400 italic">No expenses recorded.</div>}
                      </div>
                    </div>
                  </div>

                  {hoveredSlice?.chart === 'doughnut' && (
                    <div className="mt-4 p-2 bg-rose-50/40 border border-rose-100/50 rounded-xl text-center text-xs">
                      <span className="font-semibold text-slate-500">{hoveredSlice.label}:</span>
                      <span className="font-extrabold text-rose-700">{formatCurrency(hoveredSlice.val)}</span>
                    </div>
                  )}
                </div>

              </div>
            );
          })()}

          {/* Manual Sales Orders Analytics Section */}
          {revenueData.manual_orders && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex justify-between items-center bg-slate-50/50 -mx-6 -mt-6 p-6 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center space-x-2 text-base">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
                    <span>Manual Sales Orders Overview</span>
                  </h3>
                  <p className="text-xs text-slate-450 mt-0.5">Performance tracking of manually collected salesman orders and standalone ledger balances</p>
                </div>
                <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full border border-indigo-100">
                  {revenueData.manual_orders.confirmed_count + revenueData.manual_orders.pending_count} Total Orders
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
                {/* Pending Drafts */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Salesman Drafts (Pending)</span>
                    <span className="text-xl font-extrabold text-slate-800 mt-2 block">{revenueData.manual_orders.pending_count} Carts</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 mt-2 block">Value: {formatCurrency(revenueData.manual_orders.pending_value)}</span>
                </div>

                {/* Confirmed Orders Revenue */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Confirmed Sales (Accrual)</span>
                    <span className="text-xl font-extrabold text-emerald-600 mt-2 block">{formatCurrency(revenueData.manual_orders.confirmed_value)}</span>
                  </div>
                  <span className="text-xs text-slate-455 mt-2 block">From {revenueData.manual_orders.confirmed_count} completed orders</span>
                </div>

                {/* Cash Collected */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cash Received (Collected)</span>
                    <span className="text-xl font-extrabold text-emerald-700 mt-2 block">{formatCurrency(revenueData.manual_orders.confirmed_paid)}</span>
                  </div>
                  <span className="text-xs text-slate-455 mt-2 block">Liquid cash collected to date</span>
                </div>

                {/* Outstanding Credit Receivables */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Due (Receivables)</span>
                    <span className={`text-xl font-extrabold mt-2 block ${revenueData.manual_orders.confirmed_due > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                      {formatCurrency(revenueData.manual_orders.confirmed_due)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-455 mt-2 block">Unpaid salesman accounts balance</span>
                </div>
              </div>
            </div>
          )}

          {/* Ledger Table Container */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-855 text-sm">Summary Ledger Statement</h3>
              <p className="text-xs text-slate-450 mt-1">Direct comparison ledger representing cashflow indicators and margins</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    <th className="p-4 pl-6">Financial Indicator</th>
                    <th className="p-4">Type / Direction</th>
                    <th className="p-4">Description</th>
                    <th className="p-4 text-right pr-6">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">

                  {/* Row 1: Sales Revenue */}
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-bold text-slate-800">Sales Revenue</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600">
                        Inflow (+)
                      </span>
                    </td>
                    <td className="p-4 text-slate-500">Gross revenue generated from customer checkout transactions</td>
                    <td className="p-4 text-right pr-6 font-black text-emerald-600">{formatCurrency(revenueData.sales_revenue)}</td>
                  </tr>

                  {/* Row 2: COGS */}
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-bold text-slate-800">Cost of Goods Sold (COGS)</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-655">
                        Inventory Cost (-)
                      </span>
                    </td>
                    <td className="p-4 text-slate-500">Cost value of items sold (used for gross margin computation)</td>
                    <td className="p-4 text-right pr-6 font-bold text-slate-700">-{formatCurrency(revenueData.cost_of_goods_sold)}</td>
                  </tr>

                  {/* Row 3: Product Buying Cost */}
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-bold text-slate-800">Product Purchase Cost</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600">
                        Outflow (-)
                      </span>
                    </td>
                    <td className="p-4 text-slate-500">Total expenditure for restocking inventory through received purchase orders</td>
                    <td className="p-4 text-right pr-6 font-bold text-rose-600">-{formatCurrency(revenueData.inventory_purchasing_cost)}</td>
                  </tr>

                  {/* Row 4: Other Costs */}
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-bold text-slate-800">Other Costs (Overheads)</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600">
                        Outflow (-)
                      </span>
                    </td>
                    <td className="p-4 text-slate-500">Recorded operational costs (e.g. utility bills, rent, overheads)</td>
                    <td className="p-4 text-right pr-6 font-bold text-rose-600">-{formatCurrency(revenueData.other_costs)}</td>
                  </tr>

                  {/* Row 4.5: Wastage Loss */}
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-bold text-slate-800">Wastage & Damage Loss</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600">
                        Outflow (-)
                      </span>
                    </td>
                    <td className="p-4 text-slate-500">Recorded value of damaged, expired, or stolen inventory written off</td>
                    <td className="p-4 text-right pr-6 font-bold text-rose-600">-{formatCurrency(revenueData.wastage_loss || 0)}</td>
                  </tr>

                  {/* Row 4.6: Customer Returns */}
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-bold text-slate-800">Customer Returns</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600">
                        Outflow (-)
                      </span>
                    </td>
                    <td className="p-4 text-slate-500">Recorded refund value of items returned by customers</td>
                    <td className="p-4 text-right pr-6 font-bold text-rose-600">-{formatCurrency(revenueData.customer_returns || 0)}</td>
                  </tr>

                  {/* Row 4.7: Manual Sales Orders */}
                  {revenueData.manual_orders && (
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6 font-bold text-slate-800">Manual Sales Orders (Invoiced)</td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          Inflow (*)
                        </span>
                      </td>
                      <td className="p-4 text-slate-500">Confirmed salesman orders (gross revenue value is already consolidated under Sales Revenue)</td>
                      <td className="p-4 text-right pr-6 font-bold text-slate-700">{formatCurrency(revenueData.manual_orders.confirmed_value)}</td>
                    </tr>
                  )}

                  {/* Row 5: Net Profit Cashflow */}
                  <tr className="bg-slate-50/40 hover:bg-slate-50 transition-colors border-t border-slate-150">
                    <td className="p-4 pl-6 font-extrabold text-slate-800">Net Profit (Cashflow Basis)</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${revenueData.net_profit_cashflow >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                        Net Summary
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 italic">Liquid cash calculation: Sales Revenue - Buying Cost - Other Costs - Wastage Loss - Customer Returns</td>
                    <td className={`p-4 text-right pr-6 font-black text-base ${revenueData.net_profit_cashflow >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                      {formatCurrency(revenueData.net_profit_cashflow)}
                    </td>
                  </tr>

                  {/* Row 6: Net Profit COGS */}
                  <tr className="bg-slate-50/40 hover:bg-slate-50 transition-colors">
                    <td className="p-4 pl-6 font-extrabold text-slate-800">Net Profit (COGS Basis)</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${revenueData.net_profit_cogs >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                        Net Summary
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 italic">Trading margins calculation: Sales Revenue - COGS - Other Costs - Wastage Loss - Customer Returns</td>
                    <td className={`p-4 text-right pr-6 font-black text-base ${revenueData.net_profit_cogs >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                      {formatCurrency(revenueData.net_profit_cogs)}
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-450">
          No financial records found.
        </div>
      )}
    </div>
  );
}
