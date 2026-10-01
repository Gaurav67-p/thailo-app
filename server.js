/**
 * Thailo (थैलो) - Full-Stack Budgeting & Smart Finance Backend
 * Node.js + Express API with JSON persistence & Google Gemini AI Integration
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize default data file if not exists
const initialData = {
  transactions: [
    { id: 1, type: 'income', category: 'Monthly Income / Allowance', amount: 25000, note: 'Monthly budget', date: '2026-03-01' },
    { id: 2, type: 'expense', category: 'Rent & Utilities', amount: 8000, note: 'Room Rent', date: '2026-03-02' },
    { id: 3, type: 'expense', category: 'Food & Groceries', amount: 4500, note: 'Groceries & snacks', date: '2026-03-05' },
    { id: 4, type: 'expense', category: 'Transportation', amount: 1200, note: 'Bus fare & Petrol', date: '2026-03-10' }
  ],
  goals: [
    { id: 1, title: 'Emergency Fund', target: 30000, current: 18000 },
    { id: 2, title: 'Festival / Dashain Fund', target: 20000, current: 8500 },
    { id: 3, title: 'Skill Course / Laptop', target: 50000, current: 15000 }
  ]
};

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading data.json:', err);
    return initialData;
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing data.json:', err);
  }
}

// ---------------- API ENDPOINTS ----------------

// GET /api/data - Retrieve all transactions and goals
app.get('/api/data', (req, res) => {
  const data = readData();
  res.json(data);
});

// POST /api/expenses - Add transaction (Income or Expense)
app.post('/api/expenses', (req, res) => {
  const { type, category, amount, note, date } = req.body;
  if (!type || !category || !amount || isNaN(amount)) {
    return res.status(400).json({ error: 'Please provide valid type, category, and numeric amount.' });
  }

  const data = readData();
  const newTx = {
    id: Date.now(),
    type: type === 'income' ? 'income' : 'expense',
    category,
    amount: parseFloat(amount),
    note: note || '',
    date: date || new Date().toISOString().split('T')[0]
  };

  data.transactions.unshift(newTx); // Add to beginning
  writeData(data);

  res.status(201).json({ message: 'Transaction added successfully', transaction: newTx });
});

// DELETE /api/expenses/:id - Delete transaction
app.delete('/api/expenses/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const initialLen = data.transactions.length;
  data.transactions = data.transactions.filter(tx => tx.id !== id);

  if (data.transactions.length === initialLen) {
    return res.status(404).json({ error: 'Transaction not found.' });
  }

  writeData(data);
  res.json({ message: 'Transaction deleted successfully.' });
});

// POST /api/goals - Add or Update Wishlist / Savings Goal
app.post('/api/goals', (req, res) => {
  const { title, target, current } = req.body;
  if (!title || !target || isNaN(target)) {
    return res.status(400).json({ error: 'Please provide a valid goal title and target amount.' });
  }

  const data = readData();
  const newGoal = {
    id: Date.now(),
    title,
    target: parseFloat(target),
    current: parseFloat(current || 0)
  };

  data.goals.push(newGoal);
  writeData(data);

  res.status(201).json({ message: 'Goal added successfully', goal: newGoal });
});

// POST /api/ai-insights - Generate Gemini AI Smart Advice & Safe Investment Tips
app.post('/api/ai-insights', async (req, res) => {
  const data = readData();
  const totalIncome = data.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = data.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const savings = totalIncome - totalExpense;

  const apiKey = process.env.GEMINI_API_KEY;

  // Fallback if API key is missing
  if (!apiKey) {
    const fallbackAdvice = [
      `💡 **Budget Rule**: Keep your necessary expenses below 50% of income. Current net savings: रू ${savings.toLocaleString('en-IN')}.`,
      `📈 **Safe Investment (Nepal)**: Allocate at least 20% of remaining savings into NPR Fixed Deposits (FD) or Fixed Income Debentures offering ~7-10% return.`,
      `🎯 **IPO & Primary Market**: Apply for fundamental IPOs via MeroShare (ASBA fee ~रू 5-10). It requires low capital (रू 1,000) and is a low-risk entry into Nepal stock market (NEPSE).`,
      `🛡️ **Emergency Buffer**: Ensure 3-6 months of basic expenses are saved in a liquid savings account before higher-risk investments.`
    ];
    return res.json({ advice: fallbackAdvice, status: 'fallback' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
Act as a professional financial advisor in Nepal.
Analyze this summary:
- Total Monthly Income: रू ${totalIncome}
- Total Monthly Expenses: रू ${totalExpense}
- Remaining Monthly Savings: रू ${savings}
- Expense Transactions breakdown: ${JSON.stringify(data.transactions)}

Provide concise, highly actionable, personalized financial advice formatted as 4 distinct bullet points:
1. One observation on current spending habits in Nepal context.
2. One specific way to optimize monthly expenses.
3. One recommended low-risk/safe investment option in Nepal suitable for this balance (e.g., FDs, Treasury Bills, Mutual Funds, or IPOs via MeroShare).
4. One long-term wealth building tip tailored for Nepalese citizens/students.

Keep each bullet point under 25 words. Return raw bullets separated by newlines.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const text = response.text || '';
    const adviceBullets = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5);

    res.json({ advice: adviceBullets, status: 'success' });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.json({
      advice: [
        `💡 Based on your income of रू ${totalIncome.toLocaleString('en-IN')}, aim to keep savings rate above 25%.`,
        `📈 Consider low-risk MeroShare IPO applications (रू 1,000 min investment).`,
        `🏦 High-interest Savings Accounts or 1-year FDs in Class A Banks are excellent for safe capital preservation.`,
        `⚡ Build an emergency fund covering 3 months of mandatory expenses before investing.`
      ],
      status: 'fallback_error'
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Thailo (थैलो) Server is active!`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`=================================`);
});