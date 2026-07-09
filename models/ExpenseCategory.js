const mongoose = require('mongoose');

const expenseCategorySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
