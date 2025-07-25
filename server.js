const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Health check
app.get("/", (req, res) => {
  res.send("✅ Loan Manager Backend (Customers, Loans, Payments) is Running!");
});

////////////////////
// CUSTOMERS
////////////////////

// Get all customers
app.get("/api/customers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM customers ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// Create a customer
app.post("/api/customers", async (req, res) => {
  const { customer_id, name } = req.body;
  if (!customer_id || !name) return res.status(400).json({ error: "customer_id and name required" });

  try {
    const result = await pool.query(
      "INSERT INTO customers (customer_id, name) VALUES ($1, $2) RETURNING *",
      [customer_id, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create customer", details: err.message });
  }
});

////////////////////
// LOANS
////////////////////

// Get all loans
app.get("/api/loans", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM loans ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch loans" });
  }
});

// Create a loan
app.post("/api/loans", async (req, res) => {
  const {
    loan_id,
    customer_id,
    principal_amount,
    total_amount,
    interest_rate,
    loan_period_years,
    monthly_emi,
    status
  } = req.body;

  if (
    !loan_id || !customer_id || !principal_amount || !total_amount ||
    !interest_rate || !loan_period_years || !monthly_emi || !status
  ) {
    return res.status(400).json({ error: "All loan fields are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO loans (
        loan_id, customer_id, principal_amount, total_amount,
        interest_rate, loan_period_years, monthly_emi, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [loan_id, customer_id, principal_amount, total_amount, interest_rate, loan_period_years, monthly_emi, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create loan", details: err.message });
  }
});

// Get a loan by ID
app.get("/api/loans/:loan_id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM loans WHERE loan_id = $1", [req.params.loan_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Loan not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch loan" });
  }
});

// Update loan status
app.put("/api/loans/:loan_id/status", async (req, res) => {
  const { status } = req.body;
  const { loan_id } = req.params;

  if (!["ACTIVE", "PAID_OFF"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  try {
    const result = await pool.query(
      "UPDATE loans SET status = $1 WHERE loan_id = $2 RETURNING *",
      [status, loan_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Loan not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

////////////////////
// PAYMENTS
////////////////////

// Get all payments
app.get("/api/payments", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM payments ORDER BY payment_date DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// Create a payment
app.post("/api/payments", async (req, res) => {
  const { payment_id, loan_id, amount, payment_type } = req.body;

  if (!payment_id || !loan_id || !amount || !payment_type) {
    return res.status(400).json({ error: "All payment fields are required" });
  }

  if (!["EMI", "LUMP_SUM"].includes(payment_type)) {
    return res.status(400).json({ error: "Invalid payment_type. Use 'EMI' or 'LUMP_SUM'" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO payments (payment_id, loan_id, amount, payment_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [payment_id, loan_id, amount, payment_type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create payment", details: err.message });
  }
});

////////////////////

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server started on port ${PORT}`);
});
