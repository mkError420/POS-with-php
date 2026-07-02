const express = require('express');
const db = require('../config/db');
const { authenticate, authorize, enforceTenant } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(enforceTenant);

/**
 * @route   GET /api/suppliers
 * @desc    Fetch all suppliers for the active tenant
 */
router.get('/', async (req, res) => {
  const shopId = req.shopId;
  try {
    const [suppliers] = await db.query(
      'SELECT * FROM suppliers WHERE shop_id = ? ORDER BY name ASC',
      [shopId]
    );
    res.json(suppliers);
  } catch (error) {
    console.error('Fetch suppliers error:', error);
    res.status(500).json({ error: 'Server error retrieving suppliers.' });
  }
});

/**
 * @route   POST /api/suppliers
 * @desc    Create a new supplier
 */
router.post('/', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const { name, contact_name, email, phone } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Supplier name is required.' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO suppliers (shop_id, name, contact_name, email, phone) VALUES (?, ?, ?, ?, ?)',
      [shopId, name, contact_name || null, email || null, phone || null]
    );
    res.status(201).json({ message: 'Supplier created successfully.', id: result.insertId });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ error: 'Server error creating supplier.' });
  }
});

/**
 * @route   GET /api/suppliers/purchase-orders
 * @desc    Get all purchase orders for active shop
 */
router.get('/purchase-orders', async (req, res) => {
  const shopId = req.shopId;
  const { supplier_id, status } = req.query;
  try {
    let sql = `
      SELECT po.*, s.name AS supplier_name 
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.shop_id = ?
    `;
    const params = [shopId];

    if (supplier_id) {
      sql += ' AND po.supplier_id = ?';
      params.push(supplier_id);
    }
    if (status) {
      sql += ' AND po.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY po.created_at DESC';

    const [orders] = await db.query(sql, params);
    res.json(orders);
  } catch (error) {
    console.error('Fetch POs error:', error);
    res.status(500).json({ error: 'Server error fetching purchase orders.' });
  }
});

/**
 * @route   GET /api/suppliers/cost-price-logs
 * @desc    Get all cost price logs for active shop
 */
router.get('/cost-price-logs', async (req, res) => {
  const shopId = req.shopId;
  try {
    const [logs] = await db.query(
      `SELECT cpl.*, p.name AS product_name, p.sku AS product_sku, s.name AS supplier_name
       FROM cost_price_logs cpl
       JOIN products p ON cpl.product_id = p.id
       LEFT JOIN suppliers s ON cpl.supplier_id = s.id
       WHERE cpl.shop_id = ?
       ORDER BY cpl.created_at DESC`,
      [shopId]
    );
    res.json(logs);
  } catch (error) {
    console.error('Fetch cost logs error:', error);
    res.status(500).json({ error: 'Server error fetching cost price logs.' });
  }
});

/**
 * @route   GET /api/suppliers/purchase-orders/export/csv
 * @desc    Export all purchase orders as CSV file
 */
router.get('/purchase-orders/export/csv', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  try {
    const [orders] = await db.query(
      `SELECT po.id, po.order_date, po.status, po.total_amount, po.payment_basis, 
              po.paid_amount, po.due_amount, po.notes, po.created_at,
              s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.shop_id = ?
       ORDER BY po.created_at DESC`,
      [shopId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: 'No purchase orders found to export.' });
    }

    // Generate CSV content
    const headers = ['PO ID', 'Order Date', 'Status', 'Total Amount', 'Payment Basis', 'Paid Amount', 'Due Amount', 'Supplier Name', 'Supplier Email', 'Supplier Phone', 'Notes', 'Created At'];
    const csvRows = [headers.join(',')];

    orders.forEach(order => {
      const row = [
        order.id,
        order.order_date ? order.order_date.split('T')[0] : '',
        order.status,
        order.total_amount || 0,
        order.payment_basis,
        order.paid_amount || 0,
        order.due_amount || 0,
        `"${(order.supplier_name || '').replace(/"/g, '""')}"`,
        `"${(order.supplier_email || '').replace(/"/g, '""')}"`,
        `"${(order.supplier_phone || '').replace(/"/g, '""')}"`,
        `"${(order.notes || '').replace(/"/g, '""')}"`,
        order.created_at || ''
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="purchase_orders_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Server error exporting purchase orders to CSV.' });
  }
});

/**
 * @route   POST /api/suppliers/purchase-orders
 * @desc    Create a new purchase order
 */
router.post('/purchase-orders', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const { supplier_id, status, notes, items, payment_basis, paid_amount } = req.body;

  if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Supplier ID and order items are required.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += (item.quantity_ordered || 0) * (parseFloat(item.cost_price) || 0);
    }

    const finalBasis = payment_basis === 'credit' ? 'credit' : 'cash';
    let finalPaid = finalBasis === 'credit' ? parseFloat(paid_amount || 0) : totalAmount;
    if (finalPaid < 0) finalPaid = 0;
    if (finalPaid > totalAmount) finalPaid = totalAmount;
    const due_amount = totalAmount - finalPaid;

    const [poResult] = await conn.query(
      `INSERT INTO purchase_orders (shop_id, supplier_id, status, total_amount, notes, payment_basis, paid_amount, due_amount) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [shopId, supplier_id, status || 'draft', totalAmount, notes || null, finalBasis, finalPaid, due_amount]
    );
    const poId = poResult.insertId;

    if (finalBasis === 'credit' && due_amount > 0 && (status === 'ordered' || status === 'received')) {
      await conn.query(
        'UPDATE suppliers SET due_balance = due_balance + ? WHERE id = ? AND shop_id = ?',
        [due_amount, supplier_id, shopId]
      );
    }

    for (const item of items) {
      let productId = item.product_id;
      if (item.is_new) {
        const [existing] = await conn.query(
          'SELECT id FROM products WHERE shop_id = ? AND sku = ?',
          [shopId, item.sku]
        );
        if (existing.length > 0) {
          productId = existing[0].id;
        } else {
          const [pResult] = await conn.query(
            `INSERT INTO products (shop_id, name, sku, price, cost_price, stock_quantity, low_stock_threshold) 
             VALUES (?, ?, ?, ?, ?, 0, 10)`,
            [shopId, item.name, item.sku, item.selling_price || item.cost_price, item.cost_price]
          );
          productId = pResult.insertId;
        }
      }

      await conn.query(
        `INSERT INTO purchase_order_items (shop_id, purchase_order_id, product_id, quantity_ordered, cost_price, selling_price) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [shopId, poId, productId, item.quantity_ordered, item.cost_price, item.selling_price || 0.00]
      );
    }

    await conn.commit();
    res.status(201).json({ message: 'Purchase Order created successfully.', id: poId });
  } catch (error) {
    await conn.rollback();
    console.error('Create PO error:', error);
    res.status(500).json({ error: 'Server error creating Purchase Order.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   GET /api/suppliers/purchase-orders/:id
 * @desc    Get detailed purchase order by ID
 */
router.get('/purchase-orders/:id', async (req, res) => {
  const shopId = req.shopId;
  const poId = req.params.id;
  try {
    const [pos] = await db.query(
      `SELECT po.*, s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = ? AND po.shop_id = ?`,
      [poId, shopId]
    );

    if (pos.length === 0) {
      return res.status(404).json({ error: 'Purchase Order not found.' });
    }

    const [items] = await db.query(
      `SELECT poi.*, p.name AS product_name, p.sku AS product_sku
       FROM purchase_order_items poi
       JOIN products p ON poi.product_id = p.id
       WHERE poi.purchase_order_id = ? AND poi.shop_id = ?`,
      [poId, shopId]
    );

    const po = pos[0];
    po.items = items;
    res.json(po);
  } catch (error) {
    console.error('Fetch PO details error:', error);
    res.status(500).json({ error: 'Server error fetching purchase order details.' });
  }
});

/**
 * @route   PUT /api/suppliers/purchase-orders/:id
 * @desc    Update a draft purchase order
 */
router.put('/purchase-orders/:id', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const poId = req.params.id;
  const { notes, items, status, payment_basis, paid_amount } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT status, total_amount, payment_basis, paid_amount, supplier_id FROM purchase_orders WHERE id = ? AND shop_id = ?',
      [poId, shopId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Purchase Order not found.' });
    }

    const po = existing[0];
    if (po.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft Purchase Orders can be modified.' });
    }

    let totalAmount = 0;
    if (items && Array.isArray(items)) {
      for (const item of items) {
        totalAmount += (item.quantity_ordered || 0) * (parseFloat(item.cost_price) || 0);
      }
      
      await conn.query('DELETE FROM purchase_order_items WHERE purchase_order_id = ? AND shop_id = ?', [poId, shopId]);

      for (const item of items) {
        let productId = item.product_id;
        if (item.is_new) {
          const [existing] = await conn.query(
            'SELECT id FROM products WHERE shop_id = ? AND sku = ?',
            [shopId, item.sku]
          );
          if (existing.length > 0) {
            productId = existing[0].id;
          } else {
            const [pResult] = await conn.query(
              `INSERT INTO products (shop_id, name, sku, price, cost_price, stock_quantity, low_stock_threshold) 
               VALUES (?, ?, ?, ?, ?, 0, 10)`,
              [shopId, item.name, item.sku, item.selling_price || item.cost_price, item.cost_price]
            );
            productId = pResult.insertId;
          }
        }

        await conn.query(
          `INSERT INTO purchase_order_items (shop_id, purchase_order_id, product_id, quantity_ordered, cost_price, selling_price) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [shopId, poId, productId, item.quantity_ordered, item.cost_price, item.selling_price || 0.00]
        );
      }
    }

    const finalBasis = payment_basis !== undefined ? payment_basis : po.payment_basis;
    const currentTotal = totalAmount > 0 ? totalAmount : parseFloat(po.total_amount);
    let finalPaid = finalBasis === 'credit' ? (paid_amount !== undefined ? parseFloat(paid_amount) : parseFloat(po.paid_amount)) : currentTotal;
    if (finalPaid < 0) finalPaid = 0;
    if (finalPaid > currentTotal) finalPaid = currentTotal;
    const finalDue = finalBasis === 'credit' ? currentTotal - finalPaid : 0.00;

    await conn.query(
      `UPDATE purchase_orders 
       SET notes = COALESCE(?, notes), 
           status = COALESCE(?, status), 
           total_amount = CASE WHEN ? > 0 THEN ? ELSE total_amount END,
           payment_basis = ?,
           paid_amount = ?,
           due_amount = ?
       WHERE id = ? AND shop_id = ?`,
      [notes || null, status || null, totalAmount, totalAmount, finalBasis, finalPaid, finalDue, poId, shopId]
    );

    if (finalBasis === 'credit' && finalDue > 0 && (status === 'ordered' || status === 'received')) {
      await conn.query(
        'UPDATE suppliers SET due_balance = due_balance + ? WHERE id = ? AND shop_id = ?',
        [finalDue, po.supplier_id, shopId]
      );
    }

    await conn.commit();
    res.json({ message: 'Purchase Order updated successfully.' });
  } catch (error) {
    await conn.rollback();
    console.error('Update PO error:', error);
    res.status(500).json({ error: 'Server error updating Purchase Order.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   PUT /api/suppliers/purchase-orders/:id/status
 * @desc    Transition status of purchase order (Receive stocks / Cancel)
 */
router.put('/purchase-orders/:id/status', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const poId = req.params.id;
  const { status, items, notes } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [pos] = await conn.query(
      'SELECT * FROM purchase_orders WHERE id = ? AND shop_id = ?',
      [poId, shopId]
    );

    if (pos.length === 0) {
      return res.status(404).json({ error: 'Purchase Order not found.' });
    }

    const po = pos[0];

    if (po.status === 'received') {
      return res.status(400).json({ error: 'Purchase Order has already been received.' });
    }
    if (po.status === 'cancelled') {
      return res.status(400).json({ error: 'Purchase Order has already been cancelled.' });
    }

    if (status === 'cancelled') {
      await conn.query(
        'UPDATE purchase_orders SET status = ?, notes = COALESCE(?, notes) WHERE id = ? AND shop_id = ?',
        ['cancelled', notes || null, poId, shopId]
      );
      if (po.payment_basis === 'credit' && po.due_amount > 0 && (po.status === 'ordered' || po.status === 'received')) {
        await conn.query(
          'UPDATE suppliers SET due_balance = GREATEST(due_balance - ?, 0) WHERE id = ? AND shop_id = ?',
          [po.due_amount, po.supplier_id, shopId]
        );
      }
      await conn.commit();
      return res.json({ message: 'Purchase Order cancelled.' });
    }

    if (status === 'ordered') {
      await conn.query(
        'UPDATE purchase_orders SET status = ?, notes = COALESCE(?, notes) WHERE id = ? AND shop_id = ?',
        ['ordered', notes || null, poId, shopId]
      );
      if (po.status === 'draft' && po.payment_basis === 'credit' && po.due_amount > 0) {
        await conn.query(
          'UPDATE suppliers SET due_balance = due_balance + ? WHERE id = ? AND shop_id = ?',
          [po.due_amount, po.supplier_id, shopId]
        );
      }
      await conn.commit();
      return res.json({ message: 'Purchase Order status set to Ordered.' });
    }

    if (status === 'received') {
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Received items are required to mark PO as received.' });
      }

      await conn.query(
        `UPDATE purchase_orders 
         SET status = 'received', received_date = CURRENT_TIMESTAMP, notes = COALESCE(?, notes)
         WHERE id = ? AND shop_id = ?`,
        [notes || null, poId, shopId]
      );

      if (po.status === 'draft' && po.payment_basis === 'credit' && po.due_amount > 0) {
        await conn.query(
          'UPDATE suppliers SET due_balance = due_balance + ? WHERE id = ? AND shop_id = ?',
          [po.due_amount, po.supplier_id, shopId]
        );
      }

      for (const item of items) {
        const { product_id, quantity_received, cost_price, selling_price, expiry_date } = item;
        const finalExpiry = expiry_date && expiry_date.trim() !== '' ? expiry_date : null;

        await conn.query(
          `UPDATE purchase_order_items 
           SET quantity_received = ?, cost_price = ?, selling_price = ?, expiry_date = ?
           WHERE purchase_order_id = ? AND product_id = ? AND shop_id = ?`,
          [quantity_received, cost_price, selling_price || 0.00, finalExpiry, poId, product_id, shopId]
        );

        const [prodRows] = await conn.query(
          'SELECT cost_price FROM products WHERE id = ? AND shop_id = ?',
          [product_id, shopId]
        );

        if (prodRows.length > 0) {
          const product = prodRows[0];
          const oldCost = parseFloat(product.cost_price);
          const newCost = parseFloat(cost_price);

          await conn.query(
            `INSERT INTO cost_price_logs (shop_id, product_id, supplier_id, old_cost_price, new_cost_price, reason)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [shopId, product_id, po.supplier_id, oldCost, newCost, `PO Received #${poId}`]
          );

          await conn.query(
            `UPDATE products 
             SET stock_quantity = stock_quantity + ?, cost_price = ?, price = ?, expiry_date = ? 
             WHERE id = ? AND shop_id = ?`,
            [quantity_received, newCost, selling_price || newCost, finalExpiry, product_id, shopId]
          );
        }
      }

      await conn.commit();
      return res.json({ message: 'Purchase Order items successfully received, inventory and cost prices updated!' });
    }

    return res.status(400).json({ error: 'Invalid status transition requested.' });
  } catch (error) {
    await conn.rollback();
    console.error('Receive PO error:', error);
    res.status(500).json({ error: 'Server error processing PO receiving.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   DELETE /api/suppliers/purchase-orders/:id
 * @desc    Delete a purchase order
 */
router.delete('/purchase-orders/:id', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const poId = req.params.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT status, supplier_id, payment_basis, due_amount FROM purchase_orders WHERE id = ? AND shop_id = ?',
      [poId, shopId]
    );

    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Purchase Order not found.' });
    }

    const po = existing[0];
    const poStatus = po.status;

    // If PO is received, revert product stock counts
    if (poStatus === 'received') {
      const [items] = await conn.query(
        'SELECT product_id, quantity_received FROM purchase_order_items WHERE purchase_order_id = ? AND shop_id = ?',
        [poId, shopId]
      );

      for (const item of items) {
        if (item.quantity_received > 0) {
          await conn.query(
            'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ?',
            [item.quantity_received, item.product_id, shopId]
          );
        }
      }
    }

    // Revert supplier due_balance if it was ordered/received and has due_amount
    if ((poStatus === 'ordered' || poStatus === 'received') && po.payment_basis === 'credit' && po.due_amount > 0) {
      await conn.query(
        'UPDATE suppliers SET due_balance = GREATEST(due_balance - ?, 0) WHERE id = ? AND shop_id = ?',
        [po.due_amount, po.supplier_id, shopId]
      );
    }

    await conn.query('DELETE FROM purchase_orders WHERE id = ? AND shop_id = ?', [poId, shopId]);
    await conn.commit();
    res.json({ message: 'Purchase Order deleted successfully.' });
  } catch (error) {
    await conn.rollback();
    console.error('Delete PO error:', error);
    res.status(500).json({ error: 'Server error deleting Purchase Order.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   DELETE /api/suppliers/purchase-orders/:id/items/:product_id
 * @desc    Delete a product item from a purchase order
 */
router.delete('/purchase-orders/:id/items/:product_id', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const poId = req.params.id;
  const productId = req.params.product_id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [pos] = await conn.query(
      'SELECT status FROM purchase_orders WHERE id = ? AND shop_id = ?',
      [poId, shopId]
    );

    if (pos.length === 0) {
      return res.status(404).json({ error: 'Purchase Order not found.' });
    }

    const status = pos[0].status;
    if (status === 'received' || status === 'cancelled') {
      return res.status(400).json({ error: `Cannot delete items from a ${status} Purchase Order.` });
    }

    const [items] = await conn.query(
      'SELECT id FROM purchase_order_items WHERE purchase_order_id = ? AND product_id = ? AND shop_id = ?',
      [poId, productId, shopId]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: 'Product not found in this Purchase Order.' });
    }

    const [countRows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM purchase_order_items WHERE purchase_order_id = ? AND shop_id = ?',
      [poId, shopId]
    );

    if (countRows[0].cnt <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last product from a Purchase Order. Delete the Purchase Order instead.' });
    }

    await conn.query(
      'DELETE FROM purchase_order_items WHERE purchase_order_id = ? AND product_id = ? AND shop_id = ?',
      [poId, productId, shopId]
    );

    const [totalRows] = await conn.query(
      'SELECT SUM(quantity_ordered * cost_price) AS total FROM purchase_order_items WHERE purchase_order_id = ? AND shop_id = ?',
      [poId, shopId]
    );
    const newTotal = totalRows[0].total || 0.00;

    await conn.query(
      'UPDATE purchase_orders SET total_amount = ? WHERE id = ? AND shop_id = ?',
      [newTotal, poId, shopId]
    );

    await conn.commit();
    res.json({ message: 'Product successfully removed from Purchase Order.', newTotal });
  } catch (error) {
    await conn.rollback();
    console.error('Delete PO item error:', error);
    res.status(500).json({ error: 'Server error deleting product from Purchase Order.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   GET /api/suppliers/:id/profile
 * @desc    Get detailed stats, POs list and cost logs for a specific supplier profile
 */
router.get('/:id/profile', async (req, res) => {
  const shopId = req.shopId;
  const supplierId = req.params.id;

  try {
    const [suppliers] = await db.query(
      'SELECT * FROM suppliers WHERE id = ? AND shop_id = ?',
      [supplierId, shopId]
    );

    if (suppliers.length === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    const supplier = suppliers[0];

    const [spentRows] = await db.query(
      `SELECT SUM(total_amount) AS total_spent 
       FROM purchase_orders 
       WHERE supplier_id = ? AND shop_id = ? AND status = 'received'`,
      [supplierId, shopId]
    );
    const totalSpent = spentRows[0].total_spent || 0.00;

    const [poStatsRows] = await db.query(
      `SELECT status, COUNT(*) AS count 
       FROM purchase_orders 
       WHERE supplier_id = ? AND shop_id = ?
       GROUP BY status`,
      [supplierId, shopId]
    );
    const poStats = { draft: 0, ordered: 0, received: 0, cancelled: 0 };
    poStatsRows.forEach(row => {
      poStats[row.status] = row.count;
    });

    const [pos] = await db.query(
      `SELECT * FROM purchase_orders 
       WHERE supplier_id = ? AND shop_id = ?
       ORDER BY created_at DESC`,
      [supplierId, shopId]
    );

    const [costLogs] = await db.query(
      `SELECT cpl.*, p.name AS product_name, p.sku AS product_sku
       FROM cost_price_logs cpl
       JOIN products p ON cpl.product_id = p.id
       WHERE cpl.supplier_id = ? AND cpl.shop_id = ?
       ORDER BY cpl.created_at DESC`,
      [supplierId, shopId]
    );

    const [expiredProducts] = await db.query(
      `SELECT * FROM products 
       WHERE supplier_id = ? AND shop_id = ? AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE() AND stock_quantity > 0
       ORDER BY name ASC`,
      [supplierId, shopId]
    );

    const [returnsHistory] = await db.query(
      `SELECT sr.*, p.name AS product_name, p.sku AS product_sku
       FROM supplier_returns sr
       JOIN products p ON sr.product_id = p.id
       WHERE sr.supplier_id = ? AND sr.shop_id = ?
       ORDER BY sr.created_at DESC`,
      [supplierId, shopId]
    );

    res.json({
      supplier,
      stats: {
        totalSpent,
        poStats
      },
      purchaseOrders: pos,
      costLogs,
      expiredProducts,
      returnsHistory
    });

  } catch (error) {
    console.error('Fetch supplier profile stats error:', error);
    res.status(500).json({ error: 'Server error retrieving supplier profile details.' });
  }
});

/**
 * @route   PUT /api/suppliers/:id
 * @desc    Update a supplier
 */
router.put('/:id', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const supplierId = req.params.id;
  const { name, contact_name, email, phone } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Supplier name is required.' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM suppliers WHERE id = ? AND shop_id = ?',
      [supplierId, shopId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Supplier not found or access denied.' });
    }

    await db.query(
      'UPDATE suppliers SET name = ?, contact_name = ?, email = ?, phone = ? WHERE id = ? AND shop_id = ?',
      [name, contact_name || null, email || null, phone || null, supplierId, shopId]
    );

    res.json({ message: 'Supplier updated successfully.' });
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ error: 'Server error updating supplier.' });
  }
});

/**
 * @route   DELETE /api/suppliers/:id
/**
 * @route   DELETE /api/suppliers/:id
 * @desc    Delete a supplier
 */
router.delete('/:id', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const supplierId = req.params.id;

  try {
    const [existing] = await db.query(
      'SELECT id FROM suppliers WHERE id = ? AND shop_id = ?',
      [supplierId, shopId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Supplier not found or access denied.' });
    }

    await db.query('DELETE FROM suppliers WHERE id = ? AND shop_id = ?', [supplierId, shopId]);
    res.json({ message: 'Supplier deleted successfully.' });
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({ error: 'Server error deleting supplier.' });
  }
});

/**
 * @route   PUT /api/suppliers/purchase-orders/:id/pay
 * @desc    Record a payment towards a credit purchase order due balance
 */
router.put('/purchase-orders/:id/pay', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const poId = req.params.id;
  const { payment_amount } = req.body;
  const amount = parseFloat(payment_amount || 0);

  if (amount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [pos] = await conn.query(
      'SELECT * FROM purchase_orders WHERE id = ? AND shop_id = ? FOR UPDATE',
      [poId, shopId]
    );

    if (pos.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Purchase Order not found.' });
    }

    const po = pos[0];
    if (po.payment_basis !== 'credit') {
      await conn.rollback();
      return res.status(400).json({ error: 'This Purchase Order is not on a credit basis.' });
    }

    const due = parseFloat(po.due_amount);
    if (due <= 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'This Purchase Order has already been fully paid.' });
    }

    if (amount > due) {
      await conn.rollback();
      return res.status(400).json({ error: `Payment amount (${amount}) exceeds outstanding due (${due}).` });
    }

    const newDue = due - amount;
    const newPaid = parseFloat(po.paid_amount) + amount;

    await conn.query(
      'UPDATE purchase_orders SET paid_amount = ?, due_amount = ? WHERE id = ? AND shop_id = ?',
      [newPaid, newDue, poId, shopId]
    );

    // If the PO is already ordered or received, decrement the supplier's due balance
    if (po.status === 'ordered' || po.status === 'received') {
      await conn.query(
        'UPDATE suppliers SET due_balance = GREATEST(due_balance - ?, 0) WHERE id = ? AND shop_id = ?',
        [amount, po.supplier_id, shopId]
      );
    }

    await conn.commit();
    res.json({ message: 'Payment recorded successfully.', new_due: newDue, new_paid: newPaid });
  } catch (error) {
    await conn.rollback();
    console.error('Record PO payment error:', error);
    res.status(500).json({ error: 'Server error recording payment.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   POST /api/suppliers/:id/returns
 * @desc    Record an expired product return or replacement to the supplier
 * @access  Private (shop_admin)
 */
router.post('/:id/returns', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const supplierId = req.params.id;
  const { product_id, quantity, action_type, new_expiry_date, notes } = req.body;

  const qty = parseInt(quantity);
  if (!product_id || isNaN(qty) || qty <= 0 || !action_type) {
    return res.status(400).json({ error: 'Product ID, valid positive quantity, and action type are required.' });
  }

  if (action_type !== 'return' && action_type !== 'replace') {
    return res.status(400).json({ error: 'Invalid action type. Must be return or replace.' });
  }

  if (action_type === 'replace' && !new_expiry_date) {
    return res.status(400).json({ error: 'New expiry date is required for product replacement.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify supplier exists and belongs to this shop
    const [supplierRows] = await conn.query(
      'SELECT id FROM suppliers WHERE id = ? AND shop_id = ?',
      [supplierId, shopId]
    );
    if (supplierRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    // 2. Verify product exists and belongs to this shop
    const [productRows] = await conn.query(
      'SELECT id, stock_quantity, name FROM products WHERE id = ? AND shop_id = ?',
      [product_id, shopId]
    );
    if (productRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Product not found.' });
    }

    const product = productRows[0];

    if (action_type === 'return') {
      if (product.stock_quantity < qty) {
        await conn.rollback();
        return res.status(400).json({ error: `Insufficient stock to return. Current stock: ${product.stock_quantity}.` });
      }

      // Deduct stock
      await conn.query(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ?',
        [qty, product_id, shopId]
      );
    } else if (action_type === 'replace') {
      // Validate date is in the future
      const newExpDate = new Date(new_expiry_date);
      if (isNaN(newExpDate.getTime()) || newExpDate <= new Date()) {
        await conn.rollback();
        return res.status(400).json({ error: 'New expiry date must be a valid future date.' });
      }

      // Update product expiry date
      await conn.query(
        'UPDATE products SET expiry_date = ? WHERE id = ? AND shop_id = ?',
        [new_expiry_date, product_id, shopId]
      );
    }

    // Log the transaction in supplier_returns
    await conn.query(
      `INSERT INTO supplier_returns (shop_id, supplier_id, product_id, quantity, action_type, notes, new_expiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [shopId, supplierId, product_id, qty, action_type, notes || null, action_type === 'replace' ? new_expiry_date : null]
    );

    await conn.commit();
    res.json({ message: `Successfully completed product ${action_type} action.` });
  } catch (error) {
    await conn.rollback();
    console.error('Expired product action error:', error);
    res.status(500).json({ error: 'Server error processing product action.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   PUT /api/suppliers/returns/:logId
 * @desc    Update a return/replacement log entry, updating product inventory if return type
 * @access  Private (shop_admin)
 */
router.put('/returns/:logId', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const logId = req.params.logId;
  const { quantity, notes, new_expiry_date } = req.body;
  const newQty = parseInt(quantity);

  if (isNaN(newQty) || newQty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Fetch log
    const [logs] = await conn.query(
      'SELECT * FROM supplier_returns WHERE id = ? AND shop_id = ?',
      [logId, shopId]
    );

    if (logs.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Return/replacement log not found.' });
    }

    const log = logs[0];

    // 2. Adjust stock if it is a return
    if (log.action_type === 'return') {
      const [products] = await conn.query(
        'SELECT stock_quantity FROM products WHERE id = ? AND shop_id = ?',
        [log.product_id, shopId]
      );
      if (products.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Associated product not found.' });
      }

      const product = products[0];
      const diff = newQty - log.quantity; // positive means we returned more (reduce stock), negative means we returned fewer (add back to stock)
      
      if (product.stock_quantity < diff) {
        await conn.rollback();
        return res.status(400).json({ error: `Insufficient stock to return additional units. Available: ${product.stock_quantity}.` });
      }

      await conn.query(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ?',
        [diff, log.product_id, shopId]
      );
    } else if (log.action_type === 'replace') {
      // If the new expiry date changed, update the product's expiry date
      if (new_expiry_date) {
        const newExpDate = new Date(new_expiry_date);
        if (isNaN(newExpDate.getTime()) || newExpDate <= new Date()) {
          await conn.rollback();
          return res.status(400).json({ error: 'New expiry date must be a valid future date.' });
        }

        await conn.query(
          'UPDATE products SET expiry_date = ? WHERE id = ? AND shop_id = ?',
          [new_expiry_date, log.product_id, shopId]
        );
      }
    }

    // 3. Update log
    await conn.query(
      `UPDATE supplier_returns 
       SET quantity = ?, notes = ?, new_expiry_date = ? 
       WHERE id = ? AND shop_id = ?`,
      [newQty, notes || null, log.action_type === 'replace' ? (new_expiry_date || null) : null, logId, shopId]
    );

    await conn.commit();
    res.json({ message: 'Log updated successfully.' });
  } catch (error) {
    await conn.rollback();
    console.error('Update return log error:', error);
    res.status(500).json({ error: 'Server error updating return/replacement log.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   DELETE /api/suppliers/returns/:logId
 * @desc    Delete a return/replacement log entry, reverting product inventory if return type
 * @access  Private (shop_admin)
 */
router.delete('/returns/:logId', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const logId = req.params.logId;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Fetch log details
    const [logs] = await conn.query(
      'SELECT * FROM supplier_returns WHERE id = ? AND shop_id = ?',
      [logId, shopId]
    );

    if (logs.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Return/replacement log not found.' });
    }

    const log = logs[0];

    // 2. If it was a return, restore product stock
    if (log.action_type === 'return') {
      await conn.query(
        'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?',
        [log.quantity, log.product_id, shopId]
      );
    }

    // 3. Delete log
    await conn.query(
      'DELETE FROM supplier_returns WHERE id = ? AND shop_id = ?',
      [logId, shopId]
    );

    await conn.commit();
    res.json({ message: 'Log deleted successfully and inventory adjusted.' });
  } catch (error) {
    await conn.rollback();
    console.error('Delete return log error:', error);
    res.status(500).json({ error: 'Server error deleting return/replacement log.' });
  } finally {
    conn.release();
  }
});

module.exports = router;
