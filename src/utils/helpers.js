const crypto = require("node:crypto");
const prisma = require("../db/prisma");

/**
 * Normalizes a raw Discord message into a lowercase command string.
 *
 * @param {string} rawText - Original Discord message content.
 * @returns {string} Trimmed, lowercase command text.
 */
function getCommand(rawText) {
  return rawText.trim().toLowerCase();
}

// Amount-bearing messages are treated as transactions; plain words are ignored.
/**
 * Checks whether a message includes a numeric amount that can represent a transaction.
 *
 * @param {string} rawText - Original Discord message content.
 * @returns {boolean} True when the message contains an integer or decimal number.
 */
function hasAmount(rawText) {
  return /\d+(?:\.\d+)?/.test(rawText);
}

/**
 * Generates a short uppercase invitation code for a family ledger.
 *
 * @returns {string} Six-character hexadecimal code.
 */
function generateFamilyCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

/**
 * Finds or creates a user record for the Discord author.
 *
 * @param {string} discordUserId - Discord user ID.
 * @param {string} username - Current Discord username.
 * @returns {Promise<import("@prisma/client").User>} The persisted user record.
 */
async function ensureUser(discordUserId, username) {
  return prisma.user.upsert({
    where: { discordUserId },
    update: { username },
    create: {
      discordUserId,
      username
    }
  });
}

/**
 * Gets the Discord user IDs whose transactions should be visible to this user.
 *
 * @param {string} discordUserId - Discord user ID requesting ledger data.
 * @param {string} username - Current Discord username.
 * @returns {Promise<string[]>} One user ID for personal ledgers, or all family member IDs.
 */
async function getLedgerDiscordUserIds(discordUserId, username) {
  const user = await ensureUser(discordUserId, username);

  if (!user.familyId) {
    return [discordUserId];
  }

  const familyUsers = await prisma.user.findMany({
    where: { familyId: user.familyId },
    select: { discordUserId: true }
  });

  return familyUsers.map((familyUser) => familyUser.discordUserId);
}

/**
 * Builds the date range for the current calendar month.
 *
 * @returns {{ start: Date, end: Date }} Inclusive month start and exclusive next-month start.
 */
function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return { start, end };
}

module.exports = {
  ensureUser,
  generateFamilyCode,
  getCommand,
  getCurrentMonthRange,
  getLedgerDiscordUserIds,
  hasAmount
};
