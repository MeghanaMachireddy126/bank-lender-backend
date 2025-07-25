const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

// PostgreSQL connection setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Root route
app.get('/', (req, res) => {
  res.send('✅ Loan Manager Backend Running!')
})

// Create Loan
app.post('/api/loans', async (req, res) => {
  const { name, amount, rate, term, startDate } = req.body
  if (!name || !amount || !rate || !term || !startDate) {
    return res.status(400).json({ error: 'All fields required' })
  }

  try {
    const result = await pool.query(
      'INSERT INTO loans (name, amount, rate, term, start_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, amount, rate, term, startDate]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create loan' })
  }
})

// Make Payment
app.post('/api/payments', async (req, res) => {
  const { loanId, amount, paymentDate } = req.body
  if (!loanId || !amount || !paymentDate) {
    return res.status(400).json({ error: 'Missing payment data' })
  }

  try {
    const result = await pool.query(
      'INSERT INTO payments (loan_id, amount, payment_date) VALUES ($1, $2, $3) RETURNING *',
      [loanId, amount, paymentDate]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Payment failed' })
  }
})

// Ledger Route
app.get('/api/loans/:id/ledger', async (req, res) => {
  const { id } = req.params
  try {
    const payments = await pool.query(
      'SELECT * FROM payments WHERE loan_id = $1 ORDER BY payment_date ASC',
      [id]
    )
    res.json({ payments: payments.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not fetch ledger' })
  }
})

// Overview Route
app.get('/api/loans/:id/overview', async (req, res) => {
  const { id } = req.params
  try {
    const loan = await pool.query('SELECT * FROM loans WHERE id = $1', [id])
    if (!loan.rows.length) return res.status(404).json({ error: 'Loan not found' })

    const payments = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE loan_id = $1',
      [id]
    )

    const totalPaid = Number(payments.rows[0].total_paid)
    const remaining = loan.rows[0].amount - totalPaid

    res.json({ loan: loan.rows[0], totalPaid, remaining })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch overview' })
  }
})
// Middleware
app.use(cors());
app.use(express.json());

// Sample Data (You can replace this with DB logic later)
const loans = [
  { id: 1, borrower: 'John Doe', amount: 5000 },
  { id: 2, borrower: 'Jane Smith', amount: 8000 }
];

const users = [
  { id: 1, name: 'Admin User', role: 'admin' },
  { id: 2, name: 'Customer A', role: 'user' }
];

// Root route
app.get('/', (req, res) => {
  res.send('✅ Loan Manager Backend is live!');
});

// Loan routes
app.get('/api/loans', (req, res) => {
  res.json(loans);
});

// User routes
app.get('/api/users', (req, res) => {
  res.json(users);
});

// Server start
const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`✅ Server started on port ${PORT}`)
})
