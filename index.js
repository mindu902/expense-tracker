require("dotenv").config();

const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const { parseExpenseMessage } = require("./parser");

// Required environment variables for Discord, PostgreSQL, and the channel gate.
const token = process.env.DISCORD_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const expenseChannelId = process.env.EXPENSE_CHANNEL_ID;
const prisma = new PrismaClient();

if (!token) {
  console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and add your bot token.");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("Missing DATABASE_URL. Copy .env.example to .env and add your local PostgreSQL connection string.");
  process.exit(1);
}

if (!expenseChannelId) {
  console.error("Missing EXPENSE_CHANNEL_ID. Add the Discord channel ID where expenses should be processed.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot is ready as ${readyClient.user.tag}`);
  console.log(`Processing expenses only in channel ${expenseChannelId}`);
});

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

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) {
      return;
    }

    if (message.channel.id !== expenseChannelId) {
      return;
    }

    const rawText = message.content.trim();

    if (!rawText) {
      return;
    }

    const discordUserId = message.author.id;
    const username = message.author.username;
    const command = getCommand(rawText);

    if (command === "list") {
      await handleListCommand(message, discordUserId, username);
      return;
    }

    if (command === "summary") {
      await handleSummaryCommand(message, discordUserId, username);
      return;
    }

    if (command === "delete last") {
      await handleDeleteLastCommand(message, discordUserId, username);
      return;
    }

    if (command === "family" || command.startsWith("family ")) {
      await handleFamilyCommand(message, discordUserId, username, rawText);
      return;
    }

    if (!hasAmount(rawText)) {
      return;
    }

    // Parse the Discord message into a normalized transaction object.
    const parsedExpense = parseExpenseMessage(rawText);

    const messageDetails = {
      rawText: parsedExpense.rawText,
      parsedExpense,
      userId: discordUserId,
      username,
      channelId: message.channel.id,
      timestamp: message.createdAt.toISOString()
    };

    console.log("Parsed transaction:", messageDetails);

    // Save the user and transaction together so the ledger stays consistent.
    const transaction = await prisma.$transaction(async (tx) => {
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

    console.log("Transaction saved:", {
      id: transaction.id,
      discordUserId: transaction.discordUserId,
      amount: transaction.amount.toString(),
      category: transaction.category
    });

    await message.reply(
      `Recorded: ${parsedExpense.category} $${formatAmount(parsedExpense.amount)} - ${parsedExpense.description}`
    );
  } catch (error) {
    // All message-processing errors land here so invalid input does not crash the bot.
    console.error("Failed to process message:", error);

    if (message.content && hasAmount(message.content)) {
      try {
        await message.reply("Failed to record this entry. Please check the format or try again later.");
      } catch (replyError) {
        console.error("Failed to send error reply:", replyError);
      }
    }
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

/**
 * Disconnects external resources and exits the process.
 *
 * @returns {Promise<void>}
 */
async function shutdown() {
  try {
    console.log("Shutting down bot...");
    await prisma.$disconnect();
    client.destroy();
    process.exit(0);
  } catch (error) {
    console.error("Shutdown failed:", error);
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/**
 * Connects to the database and starts the Discord bot.
 *
 * @returns {Promise<void>}
 */
async function start() {
  console.log("Starting Discord expense tracker bot...");

  try {
    await prisma.$connect();
    console.log("Database connection successful.");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }

  try {
    await client.login(token);
  } catch (error) {
    console.error("Failed to login to Discord:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

start().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
