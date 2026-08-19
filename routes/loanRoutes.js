const express = require('express');
const router = express.Router();
const Loan = require('../models/Loan');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// Get all loans (Admin only)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const loans = await Loan.find({}).sort({ createdAt: -1 });
    res.json(loans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new loan record
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { lenderName, phone, amountTaken, takenDate, purpose, note } = req.body;
    
    if (!lenderName || !amountTaken || !takenDate) {
      return res.status(400).json({ message: 'Lender name, amount taken, and date are required' });
    }

    const loan = new Loan({
      lenderName,
      phone,
      amountTaken: Number(amountTaken),
      takenDate,
      purpose,
      note,
      createdBy: req.user._id,
      repayments: []
    });

    const savedLoan = await loan.save();
    res.status(201).json(savedLoan);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a loan record details
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { lenderName, phone, amountTaken, takenDate, purpose, note, status } = req.body;
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ message: 'Loan record not found' });
    }

    loan.lenderName = lenderName || loan.lenderName;
    loan.phone = phone !== undefined ? phone : loan.phone;
    loan.amountTaken = amountTaken !== undefined ? Number(amountTaken) : loan.amountTaken;
    loan.takenDate = takenDate || loan.takenDate;
    loan.purpose = purpose !== undefined ? purpose : loan.purpose;
    loan.note = note !== undefined ? note : loan.note;
    loan.status = status || loan.status;

    const updatedLoan = await loan.save();
    res.json(updatedLoan);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Add repayment to a loan
router.post('/:id/repayments', protect, adminOnly, async (req, res) => {
  try {
    const { amountPaid, paidDate, note } = req.body;
    if (!amountPaid || !paidDate) {
      return res.status(400).json({ message: 'Repayment amount and date are required' });
    }

    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ message: 'Loan record not found' });
    }

    loan.repayments.push({
      amountPaid: Number(amountPaid),
      paidDate,
      note
    });

    // Check if fully repaid
    const totalRepaid = loan.repayments.reduce((acc, r) => acc + r.amountPaid, 0);
    if (totalRepaid >= loan.amountTaken) {
      loan.status = 'Completed';
    } else {
      loan.status = 'Pending';
    }

    const updatedLoan = await loan.save();
    res.json(updatedLoan);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a repayment log from a loan
router.delete('/:id/repayments/:repaymentId', protect, adminOnly, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ message: 'Loan record not found' });
    }

    loan.repayments = loan.repayments.filter(r => r._id.toString() !== req.params.repaymentId);

    // Re-check status
    const totalRepaid = loan.repayments.reduce((acc, r) => acc + r.amountPaid, 0);
    if (totalRepaid >= loan.amountTaken) {
      loan.status = 'Completed';
    } else {
      loan.status = 'Pending';
    }

    const updatedLoan = await loan.save();
    res.json(updatedLoan);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete entire loan record
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ message: 'Loan record not found' });
    }

    await Loan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Loan record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
