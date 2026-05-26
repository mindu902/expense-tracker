const prisma = require("../db/prisma");
const { formatAmount } = require("../utils/formatters");
const { getCurrentMonthRange, getLedgerDiscordUserIds } = require("../utils/helpers");

/**
 * Replies with income, expense, and balance totals for the current month.
 *
 * @param {import("discord.js").Message} message - Discord message that triggered the command.
 * @param {string} discordUserId - Discord user ID requesting the summary.
 * @param {string} username - Current Discord username.
 * @returns {Promise<void>}
 */
async function handleSummaryCommand(message, discordUserId, username) {
  const ledgerDiscordUserIds = await getLedgerDiscordUserIds(discordUserId, username);
  const { start, end } = getCurrentMonthRange();
  const transactions = await prisma.transaction.findMany({
    where: {
      discordUserId: { in: ledgerDiscordUserIds },
      createdAt: {
        gte: start,
        lt: end
      }
    }
  });

  if (transactions.length === 0) {
    await message.reply("There are no records for this month yet.");
    return;
  }

  const totals = transactions.reduce(
    (result, transaction) => {
      const amount = Number(transaction.amount);

      if ((transaction.type) === "INCOME") {
        result.income += amount;
      } else {
        result.expense += amount;
      }

      return result;
    },
    { income: 0, expense: 0 }
  );

  const balance = totals.income - totals.expense;

  await message.reply(
    [
      "This month's summary:",
      `Income: $${formatAmount(totals.income)}`,
      `Expenses: $${formatAmount(totals.expense)}`,
      `Balance: $${formatAmount(balance)}`
    ].join("\n")
  );
}

module.exports = handleSummaryCommand;
