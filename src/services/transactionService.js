const prisma = require("../db/prisma");

/**
 * Saves the Discord user and parsed transaction in one database transaction.
 *
 * @param {object} parsedExpense - Parsed transaction from parser.js.
 * @param {string} discordUserId - Discord user ID.
 * @param {string} username - Current Discord username.
 * @returns {Promise<import("@prisma/client").Transaction>} Saved transaction record.
 */
async function saveTransaction(parsedExpense, discordUserId, username) {
  return prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { discordUserId },
      update: { username },
      create: {
        discordUserId,
        username
      }
    });

    return tx.transaction.create({
      data: {
        type: parsedExpense.type,
        description: parsedExpense.description,
        amount: parsedExpense.amount,
        currency: parsedExpense.currency,
        category: parsedExpense.category,
        rawText: parsedExpense.rawText,
        discordUserId,
        username
      }
    });
  });
}

module.exports = {
  saveTransaction
};
