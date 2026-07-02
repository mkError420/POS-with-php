const express = require('express');
const db = require('../config/db');
const { authenticate, authorize, enforceTenant } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Configure multer for CSV file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.use(authenticate);
router.use(enforceTenant);

/**
 * @route   GET /api/customers
 * @desc    Fetch all customers for the active tenant (shop_id)
 */
router.get('/', async (req, res) => {
  const shopId = req.shopId;
  try {
    const [customers] = await db.query(
      'SELECT id, name, phone, email, address, due_balance, loyalty_points FROM customers WHERE shop_id = ? ORDER BY name ASC',
      [shopId]
    );
    res.json(customers);
  } catch (error) {
    console.error('Fetch customers error:', error);
    res.status(500).json({ error: 'Server error retrieving customer directory.' });
  }
});

/**
 * @route   POST /api/customers
 * @desc    Add a new customer profile
 */
router.post('/', authorize(['shop_admin', 'shop_staff']), async (req, res) => {
  const shopId = req.shopId;
  const { name, email, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Customer name is required.' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO customers (shop_id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)',
      [shopId, name, email || null, phone || null, address || null]
    );
    res.status(201).json({ message: 'Customer profile created.', id: result.insertId });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Server error creating customer profile.' });
  }
});

/**
 * @route   POST /api/customers/bulk-upload
 * @desc    Bulk upload customers from CSV file
 */
router.post('/bulk-upload', authorize(['shop_admin']), (req, res) => {
  upload.single('csvFile')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds 5MB limit.' });
      }
      if (err.message === 'Only CSV files are allowed') {
        return res.status(400).json({ error: 'Only CSV files are allowed.' });
      }
      return res.status(400).json({ error: err.message || 'File upload error.' });
    }

    const shopId = req.shopId;

    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded.' });
    }

    (async () => {
      try {
        // Parse CSV from buffer
        const customers = [];
        const csvData = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
        
        await new Promise((resolve, reject) => {
          const stream = require('stream');
          const bufferStream = new stream.PassThrough();
          bufferStream.end(csvData);
          
          bufferStream
            .pipe(csv({
              mapHeaders: ({ header }) => header.trim().toLowerCase()
            }))
            .on('data', (row) => {
              customers.push({
                name: row.name?.trim() || '',
                email: row.email?.trim() || null,
                phone: row.phone?.trim() || null,
                address: row.address?.trim() || null
              });
            })
            .on('end', resolve)
            .on('error', reject);
        });

        if (customers.length === 0) {
          return res.status(400).json({ error: 'CSV file is empty or invalid.' });
        }

        // Validate and insert customers
        const validCustomers = [];
        const errors = [];
        
        for (let i = 0; i < customers.length; i++) {
          const customer = customers[i];
          const rowNumber = i + 2; // +2 because row 1 is header
          
          // Check if row is completely empty
          const isEmptyRow = !customer.name && !customer.email && !customer.phone && !customer.address;
          if (isEmptyRow) {
            continue;
          }
          
          if (!customer.name) {
            errors.push(`Row ${rowNumber}: Customer name is required`);
            continue;
          }
          
          validCustomers.push(customer);
        }

        if (validCustomers.length === 0) {
          return res.status(400).json({ error: 'No valid customers found in CSV.', errors });
        }

        // Bulk insert customers
        const values = validCustomers.map(customer => [
          shopId,
          customer.name,
          customer.email,
          customer.phone,
          customer.address
        ]);

        await db.query(
          'INSERT INTO customers (shop_id, name, email, phone, address) VALUES ?',
          [values]
        );

        res.status(201).json({ 
          message: `Successfully imported ${validCustomers.length} customers.`,
          imported: validCustomers.length,
          errors: errors.length > 0 ? errors : undefined
        });
      } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ error: 'Server error processing CSV upload.' });
      }
    })();
  });
});

/**
 * @route   PUT /api/customers/:id
 * @desc    Update a customer profile
 */
router.put('/:id', authorize(['shop_admin', 'shop_staff']), async (req, res) => {
  const shopId = req.shopId;
  const customerId = req.params.id;
  const { name, email, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Customer name is required.' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM customers WHERE id = ? AND shop_id = ?',
      [customerId, shopId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Customer not found or access denied.' });
    }

    await db.query(
      'UPDATE customers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ? AND shop_id = ?',
      [name, email || null, phone || null, address || null, customerId, shopId]
    );

    res.json({ message: 'Customer updated successfully.' });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Server error updating customer profile.' });
  }
});

/**
 * @route   DELETE /api/customers/:id
 * @desc    Delete a customer profile
 */
router.delete('/:id', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const customerId = req.params.id;

  try {
    const [existing] = await db.query(
      'SELECT id FROM customers WHERE id = ? AND shop_id = ?',
      [customerId, shopId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Customer not found or access denied.' });
    }

    await db.query('DELETE FROM customers WHERE id = ? AND shop_id = ?', [customerId, shopId]);
    res.json({ message: 'Customer profile deleted successfully.' });
  } catch (error) {
    console.error('Delete customer error:', error);
    // Safety check if customer is linked to sales
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ error: 'Cannot delete customer. Buyer is referenced in active transaction records.' });
    }
    res.status(500).json({ error: 'Server error deleting customer.' });
  }
});

/**
 * @route   GET /api/customers/export/csv
 * @desc    Export all customers as CSV file
 */
router.get('/export/csv', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  try {
    const [customers] = await db.query(
      'SELECT id, name, phone, email, address, due_balance, loyalty_points, created_at FROM customers WHERE shop_id = ? ORDER BY name ASC',
      [shopId]
    );

    if (customers.length === 0) {
      return res.status(404).json({ error: 'No customers found to export.' });
    }

    // Generate CSV content
    const headers = ['ID', 'Name', 'Phone', 'Email', 'Address', 'Due Balance', 'Loyalty Points', 'Created At'];
    const csvRows = [headers.join(',')];

    customers.forEach(customer => {
      const row = [
        customer.id,
        `"${(customer.name || '').replace(/"/g, '""')}"`,
        `"${(customer.phone || '').replace(/"/g, '""')}"`,
        `"${(customer.email || '').replace(/"/g, '""')}"`,
        `"${(customer.address || '').replace(/"/g, '""')}"`,
        customer.due_balance || 0,
        customer.loyalty_points || 0,
        customer.created_at || ''
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="customers_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Server error exporting customers to CSV.' });
  }
});

/**
 * @route   GET /api/customers/:id/history
 * @desc    Fetch customer transaction & purchase history
 */
router.get('/:id/history', async (req, res) => {
  const shopId = req.shopId;
  const customerId = req.params.id;

  try {
    const [customer] = await db.query(
      'SELECT id FROM customers WHERE id = ? AND shop_id = ?',
      [customerId, shopId]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: 'Customer not found or access denied.' });
    }

    const [rows] = await db.query(
      `SELECT 
        s.id AS sale_id,
        s.created_at,
        s.payment_method,
        s.total_amount,
        s.discount,
        s.tax,
        s.final_amount,
        s.paid_amount,
        s.due_amount,
        si.id AS item_id,
        si.quantity,
        si.unit_price,
        si.subtotal,
        p.name AS product_name,
        p.sku AS product_sku
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.customer_id = ? AND s.shop_id = ?
      ORDER BY s.created_at DESC`,
      [customerId, shopId]
    );

    const salesMap = {};
    rows.forEach(row => {
      if (!salesMap[row.sale_id]) {
        salesMap[row.sale_id] = {
          sale_id: row.sale_id,
          created_at: row.created_at,
          payment_method: row.payment_method,
          total_amount: row.total_amount,
          discount: row.discount,
          tax: row.tax,
          final_amount: row.final_amount,
          paid_amount: row.paid_amount,
          due_amount: row.due_amount,
          items: []
        };
      }
      // Only add item if the JOIN found a matching sale_item row
      if (row.item_id) {
        salesMap[row.sale_id].items.push({
          item_id: row.item_id,
          product_name: row.product_name,
          product_sku: row.product_sku,
          quantity: row.quantity,
          unit_price: row.unit_price,
          subtotal: row.subtotal
        });
      }
    });

    const salesList = Object.values(salesMap);

    // Fetch due payment collections
    const [payments] = await db.query(
      'SELECT id, created_at, payment_method, amount FROM due_payments WHERE customer_id = ? AND shop_id = ? ORDER BY created_at DESC',
      [customerId, shopId]
    );

    payments.forEach(p => {
      salesList.push({
        sale_id: `pay-${p.id}`,
        created_at: p.created_at,
        payment_method: p.payment_method,
        total_amount: 0,
        discount: 0,
        tax: 0,
        final_amount: p.amount,
        paid_amount: p.amount,
        due_amount: 0,
        items: []
      });
    });

    // Sort combined records chronologically by created_at DESC
    salesList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(salesList);
  } catch (error) {
    console.error('Fetch customer history error:', error);
    res.status(500).json({ error: 'Server error retrieving customer purchase history.' });
  }
});

module.exports = router;

