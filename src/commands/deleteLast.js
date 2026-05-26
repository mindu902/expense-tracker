const prisma = require("../db/prisma");
const { formatAmount } = require("../utils/formatters");
const { getLedgerDiscordUserIds } = require("../utils/helpers");

/**
 * Deletes the latest visible transaction and replies with the deleted record.
 *
 * @param {import("discord.js").Message} message - Discord message that triggered the command.
 * @param {string} discordUserId - Discord user ID requesting the delete.
 * @param {string} username - Current Discord username.
 * @returns {Promise<void>}
 */
async function handleDeleteLastCommand(message, discordUserId, username) {
  const ledgerDiscordUserIds = await getLedgerDiscordUserIds(discordUserId, username);
  const latestTransaction = await prisma.transaction.findFirst({
    where: { discordUserId: { in: ledgerDiscordUserIds } },
    orderBy: { createdAt: "desc" }
  });

  if (!latestTransaction) {
    await message.reply("There are no records to delete.");
    return;
  }

  await prisma.transaction.delete({
    where: { id: latestTransaction.id }
  });

  await message.reply(
    `Deleted the latest record: ${latestTransaction.username} ${latestTransaction.category} $${formatAmount(latestTransaction.amount)} - ${latestTransaction.description}`
  );
}

module.exports = handleDeleteLastCommand;
