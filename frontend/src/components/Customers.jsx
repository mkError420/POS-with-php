import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE_URL = 'http://localhost:5000/api';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState(null);

  // History state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [historySales, setHistorySales] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Due Payment state (inside history modal)
  const [showCollectDueModal, setShowCollectDueModal] = useState(false);
  const [duePayAmount, setDuePayAmount] = useState('');
  const [duePayMethod, setDuePayMethod] = useState('cash');
  const [duePaySubmitting, setDuePaySubmitting] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });

  // CSV upload states
  const [useCsvUpload, setUseCsvUpload] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvSuccessMessage, setCsvSuccessMessage] = useState('');

  const handleHistoryPrint = () => {
    const handleAfterPrint = () => {
      document.body.classList.remove('print-mode-history');
      window.removeEventListener('afterprint', handleAfterPrint);
    };

    window.addEventListener('afterprint', handleAfterPrint);
    document.body.classList.add('print-mode-history');

    window.requestAnimationFrame(() => window.print());
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/customers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve customers.');
      const data = await response.json();
      setCustomers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      triggerAlert('error', 'Customer name is required.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to add customer.');

      triggerAlert('success', 'Customer profile added successfully!');
      setShowAddModal(false);
      resetForm();
      fetchCustomers();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const openHistory = async (customer) => {
    setHistoryCustomer(customer);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/customers/${customer.id}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve purchase history.');
      const data = await response.json();
      setHistorySales(data);
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Refresh history + customer data after a due payment
  const refreshHistoryAndCustomer = async (customerId) => {
    try {
      const token = localStorage.getItem('token');
      // Refresh history
      const histRes = await fetch(`${API_BASE_URL}/customers/${customerId}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistorySales(histData);
      }
      // Refresh all customers (updates table + due_balance)
      const custRes = await fetch(`${API_BASE_URL}/customers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData);
        // Update the historyCustomer with fresh due_balance
        const updatedCust = custData.find(c => c.id === customerId);
        if (updatedCust) {
          setHistoryCustomer(updatedCust);
        }
      }
    } catch (err) {
      console.error('Refresh error:', err);
    }
  };

  // Collect due payment from the history modal
  const handleCollectDue = async (e) => {
    e.preventDefault();
    if (!historyCustomer) return;

    const amount = parseFloat(duePayAmount);
    if (!amount || amount <= 0) {
      triggerAlert('error', 'Please enter a valid payment amount.');
      return;
    }

    setDuePaySubmitting(true);
    try {
      const token = localStorage.getItem('token');

      // Find the customer's active held bills with due amounts
      const heldRes = await fetch(`${API_BASE_URL}/held-bills`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!heldRes.ok) throw new Error('Failed to retrieve held bills.');
      const heldBills = await heldRes.json();

      // Filter held bills for this customer with outstanding due
      const customerDueBills = heldBills.filter(
        b => b.customer_id === historyCustomer.id && b.status === 'held' && parseFloat(b.due_amount || 0) > 0
      ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // oldest first

      if (customerDueBills.length === 0) {
        throw new Error('No active held bills with due amounts found for this customer.');
      }

      // Distribute payment across held bills (oldest first)
      let remaining = amount;
      for (const bill of customerDueBills) {
        if (remaining <= 0) break;
        const billDue = parseFloat(bill.due_amount);
        const payForThis = Math.min(remaining, billDue);

        const payRes = await fetch(`${API_BASE_URL}/held-bills/${bill.id}/pay-due`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            payment_amount: payForThis,
            payment_method: duePayMethod
          })
        });

        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.error || 'Failed to process due payment.');
        remaining -= payForThis;
      }

      triggerAlert('success', `Due payment of ৳${amount.toFixed(2)} collected successfully!`);
      setShowCollectDueModal(false);
      setDuePayAmount('');
      setDuePayMethod('cash');

      // Dynamically refresh everything
      await refreshHistoryAndCustomer(historyCustomer.id);
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setDuePaySubmitting(false);
    }
  };

  const openEdit = (customer) => {
    setCurrentCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || ''
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/customers/${currentCustomer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to update customer.');

      triggerAlert('success', 'Customer profile updated successfully!');
      setShowEditModal(false);
      resetForm();
      fetchCustomers();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleDelete = async (customerId) => {
    if (!window.confirm('Are you sure you want to delete this customer profile?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to delete customer.');

      triggerAlert('success', 'Customer profile deleted successfully!');
      fetchCustomers();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const resetForm = (resetTabState = true) => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: ''
    });
    setCurrentCustomer(null);
    setCsvFile(null);
    if (resetTabState) {
      setUseCsvUpload(false);
    }
    setCsvErrors([]);
    setCsvSuccessMessage('');
  };

  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        triggerAlert('error', 'Please select a CSV file.');
        return;
      }
      setCsvFile(file);
    }
  };

  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      triggerAlert('error', 'Please select a CSV file to upload.');
      return;
    }

    setCsvUploading(true);
    setCsvErrors([]);
    setCsvSuccessMessage('');

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('csvFile', csvFile);

      const response = await fetch(`${API_BASE_URL}/customers/bulk-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const resData = await response.json();

      if (response.ok) {
        if (resData.errors && resData.errors.length > 0) {
          setCsvErrors(resData.errors);
          setCsvSuccessMessage(resData.message || `Imported ${resData.imported} customers, but some rows were skipped.`);
          triggerAlert('success', `Imported ${resData.imported} customers, check skipped rows.`);
        } else {
          triggerAlert('success', resData.message || `Successfully imported ${resData.imported} customers.`);
          setShowAddModal(false);
          resetForm();
        }
        fetchCustomers();
      } else {
        if (resData.errors && resData.errors.length > 0) {
          setCsvErrors(resData.errors);
        }
        triggerAlert('error', resData.error || 'Failed to upload CSV.');
      }
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setCsvUploading(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/customers/export/csv`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download CSV.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      triggerAlert('success', 'CSV downloaded successfully!');
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF();
      const tableData = filteredCustomers.map(customer => [
        customer.name,
        customer.phone || '-',
        customer.email || '-',
        customer.address || '-',
        `৳${parseFloat(customer.due_balance || 0).toFixed(2)}`,
        `${customer.loyalty_points || 0} pts`
      ]);

      autoTable(doc, {
        head: [['Customer Name', 'Phone Number', 'Email', 'Address', 'Due Balance', 'Loyalty Points']],
        body: tableData,
        startY: 20,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { top: 20, right: 10, bottom: 20, left: 10 }
      });

      doc.setFontSize(16);
      doc.text('Customer Directory', 14, 15);
      doc.setFontSize(10);
      doc.text(`Total Customers: ${filteredCustomers.length}`, 14, doc.lastAutoTable.finalY + 10);

      doc.save(`customers_export_${new Date().toISOString().split('T')[0]}.pdf`);
      triggerAlert('success', 'PDF downloaded successfully!');
    } catch (err) {
      triggerAlert('error', 'Failed to generate PDF.');
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const term = search.toLowerCase();
    return customer.name.toLowerCase().includes(term) ||
      (customer.phone && customer.phone.toLowerCase().includes(term));
  });

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const indexOfLastCustomer = currentPage * itemsPerPage;
  const indexOfFirstCustomer = indexOfLastCustomer - itemsPerPage;
  const currentCustomers = filteredCustomers.slice(indexOfFirstCustomer, indexOfLastCustomer);

  return (
    <div className="space-y-6">

      {alert && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center transition-all ${alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
          }`}>
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Customer Directory</h2>
          <p className="text-sm text-slate-500">Manage buyer directory, records, and contact options</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleDownloadCSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>CSV</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>PDF</span>
          </button>
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="bg-slate-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl text-sm shadow transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add New Customer</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by name or phone number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="p-4">Customer Name</th>
                <th className="p-4">Phone Number</th>
                <th className="p-4">Email</th>
                <th className="p-4">Address</th>
                <th className="p-4">Due Balance</th>
                <th className="p-4">Loyalty Points</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-slate-400">
                    No matching customers found.
                  </td>
                </tr>
              ) : (
                currentCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-semibold text-slate-800">{customer.name}</td>
                    <td className="p-4 text-slate-600">{customer.phone || '-'}</td>
                    <td className="p-4 text-slate-600">{customer.email || '-'}</td>
                    <td className="p-4 text-slate-600 max-w-[200px] truncate" title={customer.address}>{customer.address || '-'}</td>
                    <td className="p-4">
                      {parseFloat(customer.due_balance || 0) > 0 ? (
                        <span className="bg-rose-50 text-rose-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-rose-100">
                          ৳{parseFloat(customer.due_balance).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs font-medium">৳0.00</span>
                      )}
                    </td>
                    <td className="p-4 font-semibold text-slate-800">
                      <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-indigo-100">
                        {customer.loyalty_points || 0} pts
                      </span>
                    </td>
                    <td className="p-4 text-center space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openHistory(customer)}
                        className="text-emerald-600 hover:text-emerald-950 font-semibold text-xs border border-emerald-100 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        History
                      </button>
                      <button
                        onClick={() => openEdit(customer)}
                        className="text-indigo-600 hover:text-indigo-900 font-semibold text-xs border border-indigo-100 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(customer.id)}
                        className="text-rose-600 hover:text-rose-900 font-semibold text-xs border border-rose-100 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
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
            Showing <span className="text-slate-800">{indexOfFirstCustomer + 1}</span> to <span className="text-slate-800">{Math.min(indexOfLastCustomer, filteredCustomers.length)}</span> of <span className="text-slate-800">{filteredCustomers.length}</span> entries
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
                className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${currentPage === page
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

      {/* ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Add New Customer</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Toggle between manual entry and CSV upload */}
            <div className="mt-4 flex bg-slate-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => { setUseCsvUpload(false); setCsvFile(null); }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${!useCsvUpload ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                Manual Entry
              </button>
              <button
                type="button"
                onClick={() => { setUseCsvUpload(true); resetForm(false); }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${useCsvUpload ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                CSV Upload
              </button>
            </div>

            {!useCsvUpload ? (
              <form onSubmit={handleAddSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Customer Full Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g. Alice Cooper"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone Number</label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="555-0140"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="alice@gmail.com"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Physical Address</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="123 Dhaka Ave"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-slate-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow"
                  >
                    Save Customer
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCsvUpload} className="mt-4 space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-indigo-800">CSV Format Requirements</p>
                      <p className="text-xs text-indigo-600 mt-1">Your CSV file must have at least the required column header below. Other column headers are optional:</p>
                      <code className="block mt-2 text-xs bg-indigo-100 text-indigo-900 p-2 rounded border border-indigo-200">
                        name, email, phone, address
                      </code>
                      <p className="text-xs text-indigo-600 mt-2">Only the "name" column is required. "email", "phone", and "address" are optional.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Select CSV File *</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileChange}
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500 file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  </div>
                  {csvFile && (
                    <p className="mt-2 text-xs text-slate-600 flex items-center">
                      <svg className="w-4 h-4 mr-1 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Selected: {csvFile.name}
                    </p>
                  )}
                </div>

                {csvSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium">
                    {csvSuccessMessage}
                  </div>
                )}

                {csvErrors && csvErrors.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg max-h-40 overflow-y-auto">
                    <p className="text-xs font-bold text-rose-800 mb-1">Import Warnings / Errors:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {csvErrors.map((err, idx) => (
                        <li key={idx} className="text-xs text-rose-600 font-medium">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={csvUploading || !csvFile}
                    className="px-5 py-2 bg-slate-600 hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors shadow flex items-center space-x-2"
                  >
                    {csvUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>Upload CSV</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Edit Customer: {currentCustomer?.name}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone Number</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Physical Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PURCHASE HISTORY MODAL */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Purchase History</h3>
                <div className="flex items-center space-x-2 mt-1">
                  <p className="text-xs text-slate-500">Customer Profile: <span className="font-semibold text-indigo-600">{historyCustomer?.name}</span></p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {!historyLoading && historySales.length > 0 && (
                  <button
                    onClick={handleHistoryPrint}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center space-x-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <span>Print PDF</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowHistoryModal(false); setHistorySales([]); setShowCollectDueModal(false); }}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Due Balance Summary Card */}
            {historyCustomer && (
              <div className={`mt-4 rounded-xl p-4 border flex items-center justify-between ${parseFloat(historyCustomer.due_balance || 0) > 0
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-emerald-50 border-emerald-200'
                }`}>
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${parseFloat(historyCustomer.due_balance || 0) > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${parseFloat(historyCustomer.due_balance || 0) > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>Outstanding Due Balance</p>
                    <p className={`text-xl font-extrabold ${parseFloat(historyCustomer.due_balance || 0) > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      ৳{parseFloat(historyCustomer.due_balance || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
                {parseFloat(historyCustomer.due_balance || 0) > 0 && (
                  <button
                    onClick={() => {
                      setDuePayAmount(parseFloat(historyCustomer.due_balance).toFixed(2));
                      setDuePayMethod('cash');
                      setShowCollectDueModal(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors shadow-sm flex items-center space-x-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Collect Due</span>
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
              {historyLoading ? (
                <div className="flex justify-center items-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
                </div>
              ) : historySales.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No purchases recorded for this customer profile yet.
                </div>
              ) : (
                historySales.map((sale) => {
                  const isDuePayment = sale.items.length === 0 && parseFloat(sale.total_amount) === 0;
                  return (
                    <div key={sale.sale_id} className={`border rounded-xl p-4 space-y-3 ${isDuePayment ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                      {/* Sale Info Header */}
                      <div className="flex justify-between items-center border-b border-slate-200/60 pb-2 text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-800">Sale #{sale.sale_id}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500">
                            {new Date(sale.created_at).toLocaleString()}
                          </span>
                          {isDuePayment && (
                            <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase border border-emerald-200">
                              Due Payment
                            </span>
                          )}
                        </div>
                        <span className="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                          {sale.payment_method.replace('_', ' ')}
                        </span>
                      </div>

                      {isDuePayment ? (
                        /* Due Payment Display */
                        <div className="flex items-center justify-between py-2">
                          <div className="flex items-center space-x-2">
                            <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-600">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span className="text-sm font-semibold text-emerald-800">Due Balance Payment Collected</span>
                          </div>
                          <span className="text-lg font-extrabold text-emerald-700">৳{parseFloat(sale.final_amount).toFixed(2)}</span>
                        </div>
                      ) : (
                        /* Normal Sale Items Table */
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="text-slate-400 font-semibold border-b border-slate-200/40">
                                  <th className="pb-1.5">Product Description</th>
                                  <th className="pb-1.5 text-center">Qty</th>
                                  <th className="pb-1.5 text-right">Unit Price</th>
                                  <th className="pb-1.5 text-right">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {sale.items.map((item) => (
                                  <tr key={item.item_id}>
                                    <td className="py-1.5 font-medium">{item.product_name}</td>
                                    <td className="py-1.5 text-center">{item.quantity}</td>
                                    <td className="py-1.5 text-right">৳{parseFloat(item.unit_price).toFixed(2)}</td>
                                    <td className="py-1.5 text-right font-semibold">৳{parseFloat(item.subtotal).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Sale Summary Footer */}
                          <div className="flex justify-end pt-2 border-t border-slate-200/40">
                            <div className="w-48 text-xs space-y-1">
                              <div className="flex justify-between text-slate-500">
                                <span>Subtotal:</span>
                                <span>৳{parseFloat(sale.total_amount).toFixed(2)}</span>
                              </div>
                              {parseFloat(sale.discount) > 0 && (
                                <div className="flex justify-between text-rose-500">
                                  <span>Discount:</span>
                                  <span>-৳{parseFloat(sale.discount).toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-slate-500">
                                <span>Tax:</span>
                                <span>৳{parseFloat(sale.tax).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-1 text-sm">
                                <span>Paid:</span>
                                <span className="text-emerald-600">৳{parseFloat(sale.paid_amount !== undefined ? sale.paid_amount : sale.final_amount).toFixed(2)}</span>
                              </div>
                              {parseFloat(sale.due_amount || 0) > 0 && (
                                <div className="flex justify-between font-semibold text-rose-600 text-xs">
                                  <span>Due Balance:</span>
                                  <span>৳{parseFloat(sale.due_amount).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => { setShowHistoryModal(false); setHistorySales([]); setShowCollectDueModal(false); }}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- COLLECT DUE MODAL (inside history flow) --- */}
      {showCollectDueModal && historyCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Collect Due Payment</h3>
                <p className="text-xs text-slate-400 mt-0.5">Customer: {historyCustomer.name}</p>
              </div>
              <button onClick={() => setShowCollectDueModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Outstanding Amount Display */}
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
              <p className="text-xs font-bold text-rose-500 uppercase tracking-wider">Outstanding Due Balance</p>
              <p className="text-3xl font-extrabold text-rose-700 mt-1">৳{parseFloat(historyCustomer.due_balance || 0).toFixed(2)}</p>
            </div>

            <form onSubmit={handleCollectDue} className="mt-5 space-y-4">
              {/* Payment Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Payment Amount (৳)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={parseFloat(historyCustomer.due_balance || 0)}
                    value={duePayAmount}
                    onChange={(e) => setDuePayAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    className="flex-1 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setDuePayAmount(parseFloat(historyCustomer.due_balance || 0).toFixed(2))}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold py-2 px-3 rounded-lg text-xs transition-colors whitespace-nowrap"
                  >
                    Full Amount
                  </button>
                </div>
                {parseFloat(duePayAmount) > 0 && parseFloat(duePayAmount) < parseFloat(historyCustomer.due_balance || 0) && (
                  <p className="mt-1.5 text-[10px] text-amber-600 font-medium">
                    Partial payment — remaining: ৳{(parseFloat(historyCustomer.due_balance || 0) - parseFloat(duePayAmount)).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'card', 'mobile_pay'].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setDuePayMethod(method)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition-all ${duePayMethod === method
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      {method === 'mobile_pay' ? 'Mobile' : method.charAt(0).toUpperCase() + method.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCollectDueModal(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={duePaySubmitting || !parseFloat(duePayAmount) || parseFloat(duePayAmount) <= 0}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-semibold transition-colors shadow flex items-center space-x-1.5"
                >
                  {duePaySubmitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Collect ৳{parseFloat(duePayAmount || 0).toFixed(2)}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* --- DYNAMIC HISTORY PRINT AREA (OFF-SCREEN) --- */}
      {historyCustomer && createPortal(
        <div id="history-print-area">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #cbd5e1', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 4px 0' }}>
                Customer Purchase History Report
              </h1>
              <p style={{ margin: '0 0 2px 0', color: '#64748b' }}>Store Record Summary</p>
              <p style={{ margin: '0', color: '#64748b', fontSize: '12px' }}>Report Generated: {new Date().toLocaleString()}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981', margin: '0 0 4px 0' }}>PROFILE SUMMARY</h2>
              <p style={{ margin: '0 0 2px 0', color: '#64748b', fontSize: '12px' }}><strong>Customer ID:</strong> #{historyCustomer.id}</p>
            </div>
          </div>

          {/* Customer Details Block */}
          <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>
              Customer Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
              <div><strong>Name:</strong> {historyCustomer.name}</div>
              <div><strong>Phone Number:</strong> {historyCustomer.phone || '-'}</div>
              <div><strong>Email:</strong> {historyCustomer.email || '-'}</div>
              <div><strong>Address:</strong> {historyCustomer.address || '-'}</div>
              <div><strong>Outstanding Due Balance:</strong> ৳{parseFloat(historyCustomer.due_balance || 0).toFixed(2)}</div>
            </div>
          </div>

          {/* Purchases List */}
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
            Transaction Records ({historySales.length} sales)
          </h3>

          {historySales.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', fontSize: '13px' }}>No transaction history found for this customer.</p>
          ) : (
            <div style={{ spaceY: '20px' }}>
              {historySales.map((sale) => (
                <div key={sale.sale_id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px', pageBreakInside: 'avoid' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                    <span>Transaction #{sale.sale_id} - {new Date(sale.created_at).toLocaleString()}</span>
                    <span>Method: {sale.payment_method.toUpperCase()}</span>
                  </div>

                  {sale.items.length === 0 ? (
                    <div style={{ padding: '8px 0', fontSize: '13px', fontWeight: '600', color: '#059669' }}>✓ Due Balance Payment Collected — ৳{parseFloat(sale.final_amount).toFixed(2)}</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ paddingBottom: '4px' }}>Purchased Product</th>
                          <th style={{ paddingBottom: '4px', textAlign: 'center' }}>Qty</th>
                          <th style={{ paddingBottom: '4px', textAlign: 'right' }}>Unit Price</th>
                          <th style={{ paddingBottom: '4px', textAlign: 'right' }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sale.items.map((item) => (
                          <tr key={item.item_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '6px 0' }}>{item.product_name}</td>
                            <td style={{ padding: '6px 0', textAlign: 'center' }}>{item.quantity}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right' }}>৳{parseFloat(item.unit_price).toFixed(2)}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: '600' }}>৳{parseFloat(item.subtotal).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                    <div style={{ width: '200px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span>
                        <span>৳{parseFloat(sale.total_amount).toFixed(2)}</span>
                      </div>
                      {parseFloat(sale.discount) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                          <span>Discount:</span>
                          <span>-৳{parseFloat(sale.discount).toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tax:</span>
                        <span>৳{parseFloat(sale.tax).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                        <span>Final Total:</span>
                        <span>৳{parseFloat(sale.final_amount).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '2px' }}>
                        <span>Total Paid:</span>
                        <span>৳{parseFloat(sale.paid_amount !== undefined ? sale.paid_amount : sale.final_amount).toFixed(2)}</span>
                      </div>
                      {parseFloat(sale.due_amount || 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', color: '#ef4444' }}>
                          <span>Due Balance:</span>
                          <span>৳{parseFloat(sale.due_amount).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Report Footer */}
          <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: '10px', marginTop: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
            <p style={{ margin: '0' }}>End of Purchase History Report for {historyCustomer.name}.</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
