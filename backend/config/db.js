const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'multitenant_pos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection on startup and run migrations
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to the Multi-Tenant POS Database.');
    
    // Check if allowed_sections column exists on users table
    const [columns] = await connection.query("SHOW COLUMNS FROM `users` LIKE 'allowed_sections'");
    if (columns.length === 0) {
      await connection.query("ALTER TABLE `users` ADD COLUMN `allowed_sections` JSON NULL");
      console.log("Migration: Added 'allowed_sections' column to 'users' table.");
    }

    // Check if unit column exists on products table
    const [prodColumns] = await connection.query("SHOW COLUMNS FROM `products` LIKE 'unit'");
    if (prodColumns.length === 0) {
      await connection.query("ALTER TABLE `products` ADD COLUMN `unit` VARCHAR(20) NOT NULL DEFAULT 'piece'");
      console.log("Migration: Added 'unit' column to 'products' table.");
    }

    // Check if due_balance column exists on suppliers table
    const [suppColumns] = await connection.query("SHOW COLUMNS FROM `suppliers` LIKE 'due_balance'");
    if (suppColumns.length === 0) {
      await connection.query("ALTER TABLE `suppliers` ADD COLUMN `due_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00");
      console.log("Migration: Added 'due_balance' column to 'suppliers' table.");
    }

    // Check if payment_basis column exists on purchase_orders table
    const [poBasisCol] = await connection.query("SHOW COLUMNS FROM `purchase_orders` LIKE 'payment_basis'");
    if (poBasisCol.length === 0) {
      await connection.query("ALTER TABLE `purchase_orders` ADD COLUMN `payment_basis` ENUM('cash', 'credit') NOT NULL DEFAULT 'cash'");
      console.log("Migration: Added 'payment_basis' column to 'purchase_orders' table.");
    }

    // Check if expiry_date column exists on purchase_order_items table
    const [poiExpiryCol] = await connection.query("SHOW COLUMNS FROM `purchase_order_items` LIKE 'expiry_date'");
    if (poiExpiryCol.length === 0) {
      await connection.query("ALTER TABLE `purchase_order_items` ADD COLUMN `expiry_date` DATE NULL");
      console.log("Migration: Added 'expiry_date' column to 'purchase_order_items' table.");
    }

    // Check if paid_amount column exists on purchase_orders table
    const [poPaidCol] = await connection.query("SHOW COLUMNS FROM `purchase_orders` LIKE 'paid_amount'");
    if (poPaidCol.length === 0) {
      await connection.query("ALTER TABLE `purchase_orders` ADD COLUMN `paid_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00");
      console.log("Migration: Added 'paid_amount' column to 'purchase_orders' table.");
    }

    // Check if due_amount column exists on purchase_orders table
    const [poDueCol] = await connection.query("SHOW COLUMNS FROM `purchase_orders` LIKE 'due_amount'");
    if (poDueCol.length === 0) {
      await connection.query("ALTER TABLE `purchase_orders` ADD COLUMN `due_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00");
      console.log("Migration: Added 'due_amount' column to 'purchase_orders' table.");
    }
    
    // Create supplier_returns table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`supplier_returns\` (
        \`id\` INT AUTO_INCREMENT,
        \`shop_id\` INT NOT NULL,
        \`supplier_id\` INT NOT NULL,
        \`product_id\` INT NOT NULL,
        \`quantity\` INT NOT NULL,
        \`action_type\` ENUM('return', 'replace') NOT NULL,
        \`notes\` TEXT NULL,
        \`new_expiry_date\` DATE NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_supplier_returns_shop\` FOREIGN KEY (\`shop_id\`) REFERENCES \`shops\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_supplier_returns_supplier\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`suppliers\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_supplier_returns_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("Migration: Verified and created 'supplier_returns' table.");

    // Create customer_returns table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`customer_returns\` (
        \`id\` INT AUTO_INCREMENT,
        \`shop_id\` INT NOT NULL,
        \`customer_id\` INT NULL,
        \`sale_id\` INT NULL,
        \`product_id\` INT NOT NULL,
        \`quantity\` INT NOT NULL,
        \`refund_amount\` DECIMAL(10,2) NOT NULL,
        \`refund_method\` VARCHAR(30) NOT NULL DEFAULT 'cash',
        \`notes\` TEXT NULL,
        \`deduct_from_due\` TINYINT(1) NOT NULL DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_customer_returns_shop\` FOREIGN KEY (\`shop_id\`) REFERENCES \`shops\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_customer_returns_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_customer_returns_sale\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_customer_returns_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("Migration: Verified and created 'customer_returns' table.");

    const [refundMethodColumns] = await connection.query("SHOW COLUMNS FROM `customer_returns` LIKE 'refund_method'");
    if (refundMethodColumns.length === 0) {
      await connection.query("ALTER TABLE `customer_returns` ADD COLUMN `refund_method` VARCHAR(30) NOT NULL DEFAULT 'cash'");
      console.log("Migration: Added 'refund_method' column to 'customer_returns' table.");
    }

    // Check if logo column exists on users table
    const [logoColumns] = await connection.query("SHOW COLUMNS FROM `users` LIKE 'logo'");
    if (logoColumns.length === 0) {
      await connection.query("ALTER TABLE `users` ADD COLUMN `logo` LONGTEXT NULL");
      console.log("Migration: Added 'logo' column to 'users' table.");
    }

    // Check if logo column exists on shops table
    const [shopLogoColumns] = await connection.query("SHOW COLUMNS FROM `shops` LIKE 'logo'");
    if (shopLogoColumns.length === 0) {
      await connection.query("ALTER TABLE `shops` ADD COLUMN `logo` LONGTEXT NULL");
      console.log("Migration: Added 'logo' column to 'shops' table.");
    }

    // Create due_payments table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`due_payments\` (
        \`id\` INT AUTO_INCREMENT,
        \`shop_id\` INT NOT NULL,
        \`customer_id\` INT NOT NULL,
        \`sale_id\` INT NULL,
        \`amount\` DECIMAL(10,2) NOT NULL,
        \`payment_method\` ENUM('cash', 'card', 'mobile_pay', 'other') NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_due_payments_shop\` FOREIGN KEY (\`shop_id\`) REFERENCES \`shops\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_due_payments_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_due_payments_sale\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("Migration: Verified and created 'due_payments' table.");

    // Check if transaction_reference column exists on due_payments table
    const [duePayColumns] = await connection.query("SHOW COLUMNS FROM `due_payments` LIKE 'transaction_reference'");
    if (duePayColumns.length === 0) {
      await connection.query("ALTER TABLE `due_payments` ADD COLUMN `transaction_reference` VARCHAR(255) NULL");
      await connection.query("ALTER TABLE `due_payments` ADD COLUMN `note` TEXT NULL");
      console.log("Migration: Added 'transaction_reference' and 'note' columns to 'due_payments' table.");
    }
    
    // Create manual_orders table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`manual_orders\` (
        \`id\` INT AUTO_INCREMENT,
        \`shop_id\` INT NOT NULL,
        \`salesman_name\` VARCHAR(255) NOT NULL,
        \`customer_id\` INT NULL,
        \`customer_name\` VARCHAR(255) NULL,
        \`customer_phone\` VARCHAR(50) NULL,
        \`customer_address\` TEXT NULL,
        \`payment_method\` ENUM('cash', 'credit') NOT NULL DEFAULT 'cash',
        \`discount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`tax\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`notes\` TEXT NULL,
        \`status\` ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
        \`sale_id\` INT NULL,
        \`created_by\` INT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_manual_orders_shop\` FOREIGN KEY (\`shop_id\`) REFERENCES \`shops\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_manual_orders_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_manual_orders_sale\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_manual_orders_user\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("Migration: Verified and created 'manual_orders' table.");

    // Check if customer_name column exists on manual_orders table (for systems where it was created in a previous step)
    const [moNameCol] = await connection.query("SHOW COLUMNS FROM \`manual_orders\` LIKE 'customer_name'");
    if (moNameCol.length === 0) {
      await connection.query("ALTER TABLE \`manual_orders\` ADD COLUMN \`customer_name\` VARCHAR(255) NULL");
      await connection.query("ALTER TABLE \`manual_orders\` ADD COLUMN \`customer_phone\` VARCHAR(50) NULL");
      await connection.query("ALTER TABLE \`manual_orders\` ADD COLUMN \`customer_address\` TEXT NULL");
      console.log("Migration: Added manual customer details columns to 'manual_orders' table.");
    }

    // Create manual_order_items table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`manual_order_items\` (
        \`id\` INT AUTO_INCREMENT,
        \`order_id\` INT NOT NULL,
        \`shop_id\` INT NOT NULL,
        \`product_id\` INT NOT NULL,
        \`quantity\` INT NOT NULL,
        \`unit_price\` DECIMAL(10,2) NOT NULL,
        \`subtotal\` DECIMAL(10,2) NOT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_manual_order_items_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`manual_orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_manual_order_items_shop\` FOREIGN KEY (\`shop_id\`) REFERENCES \`shops\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_manual_order_items_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("Migration: Verified and created 'manual_order_items' table.");

    connection.release();
  } catch (error) {
    console.error('Database connection or migration failed:', error.message);
  }
})();

module.exports = pool;
