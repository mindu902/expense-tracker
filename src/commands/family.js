const prisma = require("../db/prisma");
const { ensureUser, generateFamilyCode } = require("../utils/helpers");

/**
 * Creates a family invitation code that does not already exist in the database.
 *
 * @returns {Promise<string>} Unique six-character family invitation code.
 * @throws {Error} If a unique code cannot be generated after several attempts.
 */
async function createUniqueFamilyCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateFamilyCode();
    const existingFamily = await prisma.family.findUnique({ where: { code } });

    if (!existingFamily) {
      return code;
    }
  }

  throw new Error("Failed to generate a unique family code.");
}

/**
 * Handles family ledger commands: status, create, join, and leave.
 *
 * @param {import("discord.js").Message} message - Discord message that triggered the command.
 * @param {string} discordUserId - Discord user ID issuing the family command.
 * @param {string} username - Current Discord username.
 * @param {string} rawText - Original command text.
 * @returns {Promise<void>}
 */
async function handleFamilyCommand(message, discordUserId, username, rawText) {
  const [, action = "", ...args] = rawText.trim().split(/\s+/);
  const user = await ensureUser(discordUserId, username);

  if (!action) {
    const currentUser = await prisma.user.findUnique({
      where: { discordUserId },
      include: { family: { include: { users: true } } }
    });

    if (!currentUser.family) {
      await message.reply("You have not joined a family ledger yet. Send `family create Family Name` to create one, or `family join CODE` to join one.");
      return;
    }

    const members = currentUser.family.users.map((familyUser) => familyUser.username).join(", ");
    await message.reply(
      `Family ledger: ${currentUser.family.name}\nInvite code: ${currentUser.family.code}\nMembers: ${members}`
    );
    return;
  }

  if (action === "create") {
    if (user.familyId) {
      await message.reply("You are already in a family ledger.");
      return;
    }

    const name = args.join(" ").trim() || `${username} family`;
    const code = await createUniqueFamilyCode();
    const family = await prisma.family.create({
      data: {
        name,
        code,
        users: {
          connect: { discordUserId }
        }
      }
    });

    await message.reply(`Created family ledger: ${family.name}\nInvite code: ${family.code}`);
    return;
  }

  if (action === "join") {
    if (user.familyId) {
      await message.reply("You are already in a family ledger. Send `family leave` first if you want to switch.");
      return;
    }

    const code = (args[0] || "").toUpperCase();

    if (!code) {
      await message.reply("Please provide an invite code, for example: `family join A1B2C3`");
      return;
    }

    const family = await prisma.family.findUnique({ where: { code } });

    if (!family) {
      await message.reply("No family ledger was found for that invite code.");
      return;
    }

    await prisma.user.update({
      where: { discordUserId },
      data: { familyId: family.id }
    });

    await message.reply(`Joined family ledger: ${family.name}`);
    return;
  }

  if (action === "leave") {
    if (!user.familyId) {
      await message.reply("You have not joined a family ledger yet.");
      return;
    }

    await prisma.user.update({
      where: { discordUserId },
      data: { familyId: null }
    });

    await message.reply("You have left the family ledger. Your old records will stay in the database.");
    return;
  }

  await message.reply("Available commands: `family`, `family create Family Name`, `family join CODE`, `family leave`");
}

module.exports = handleFamilyCommand;
