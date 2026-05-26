const prisma = require("../db/prisma");
const { formatTransactionLine } = require("../utils/formatters");
const { getLedgerDiscordUserIds } = require("../utils/helpers");

/**
 * Replies with the most recent transactions visible to the requesting user.
 *
 * @param {import("discord.js").Message} message - Discord message that triggered the command.
 * @param {string} discordUserId - Discord user ID requesting the list.
 * @param {string} username - Current Discord username.
 * @returns {Promise<void>}
 */
async function handleListCommand(message, discordUserId, username) {
  const ledgerDiscordUserIds = await getLedgerDiscordUserIds(discordUserId, username);
  const transactions = await prisma.transaction.findMany({
    where: { discordUserId: { in: ledgerDiscordUserIds } },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  if (transactions.length === 0) {
    await message.reply("You do not have any records yet. Send `coffee 5` to add your first one.");
    return;
  }

  const lines = transactions.map(formatTransactionLine).join("\n");
  await message.reply(`Your latest 10 records:\n${lines}`);
}

module.exports = handleListCommand;
