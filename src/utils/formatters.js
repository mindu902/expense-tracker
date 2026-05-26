/**
 * Formats a numeric amount for user-facing Discord replies.
 *
 * @param {number|string|import("@prisma/client/runtime/library").Decimal} amount - Amount to display.
 * @returns {string} Whole numbers without decimals, otherwise two decimal places.
 */
function formatAmount(amount) {
  const numericAmount = Number(amount);
  return Number.isInteger(numericAmount) ? String(numericAmount) : numericAmount.toFixed(2);
}

/**
 * Formats one transaction as a numbered line for the `list` command.
 *
 * @param {object} transaction - Transaction record returned by Prisma.
 * @param {number} index - Zero-based list index.
 * @returns {string} Human-readable transaction summary.
 */
function formatTransactionLine(transaction, index) {
  const sign = transaction.type === "INCOME" ? "+" : "-";
  const amount = formatAmount(transaction.amount);
  const date = transaction.createdAt.toISOString().slice(0, 10);

  return `${index + 1}. ${date} ${transaction.username} ${transaction.category} ${sign}$${amount} - ${transaction.description}`;
}

module.exports = {
  formatAmount,
  formatTransactionLine
};
