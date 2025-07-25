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

// Create a loan with EMI calculation
// Create a loan
app.post("/api/loans", async (req, res) => {
  const { customer_id, loan_amount, loan_period_years, interest_rate_yearly } = req.body;

  if (!customer_id || !loan_amount || !loan_period_years || !interest_rate_yearly) {
    return res.status(400).json({ error: "customer_id, loan_amount, loan_period_years, interest_rate_yearly are required" });
  }

  try {
    // Perform calculations
    const P = parseFloat(loan_amount);
    const N = parseInt(loan_period_years, 10);
    const R = parseFloat(interest_rate_yearly);

    const total_interest = P * N * (R / 100);
    const total_amount = P + total_interest;
    const monthly_emi = total_amount / (N * 12);

    // Generate a loan_id (UUID or timestamp-based)
    const loan_id = `L${Date.now()}`;

    // Insert into DB
    const result = await pool.query(
      `INSERT INTO loans (loan_id, customer_id, principal_amount, total_amount, interest_rate, loan_period_years, monthly_emi, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING loan_id, customer_id, total_amount AS total_amount_payable, monthly_emi`,
      [loan_id, customer_id, P, total_amount, R, N, monthly_emi, "ACTIVE"]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Loan creation error:", err);
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
// LEDGER (Loan transactions)
////////////////////
app.get("/api/loans/:loan_id/ledger", async (req, res) => {
  try {
    const loan = await pool.query("SELECT * FROM loans WHERE loan_id = $1", [req.params.loan_id]);
    if (loan.rows.length === 0) return res.status(404).json({ error: "Loan not found" });

    const payments = await pool.query("SELECT * FROM payments WHERE loan_id = $1 ORDER BY payment_date DESC", [req.params.loan_id]);

    const amount_paid = payments.rows.reduce((sum, p) => sum + Number(p.amount), 0);
    const balance_amount = loan.rows[0].total_amount - amount_paid;
    const emis_left = Math.ceil(balance_amount / loan.rows[0].monthly_emi);

    res.json({
      loan_id: loan.rows[0].loan_id,
      customer_id: loan.rows[0].customer_id,
      principal: loan.rows[0].principal_amount,
      total_amount: loan.rows[0].total_amount,
      monthly_emi: loan.rows[0].monthly_emi,
      amount_paid,
      balance_amount,
      emis_left,
      transactions: payments.rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch ledger", details: err.message });
  }
});

////////////////////
// ACCOUNT OVERVIEW
////////////////////
app.get("/api/customers/:customer_id/overview", async (req, res) => {
  try {
    const loans = await pool.query("SELECT * FROM loans WHERE customer_id = $1", [req.params.customer_id]);
    if (loans.rows.length === 0) return res.status(404).json({ error: "No loans found for customer" });

    const loanSummaries = loans.rows.map((loan) => ({
      loan_id: loan.loan_id,
      principal: loan.principal_amount,
      total_amount: loan.total_amount,
      total_interest: loan.total_amount - loan.principal_amount,
      emi_amount: loan.monthly_emi,
      amount_paid: 0, // Can be calculated if needed by summing payments
      emis_left: Math.ceil(loan.total_amount / loan.monthly_emi),
    }));

    res.json({
      customer_id: req.params.customer_id,
      total_loans: loans.rows.length,
      loans: loanSummaries,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch overview", details: err.message });
  }
});

////////////////////
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server started on port ${PORT}`);
});
