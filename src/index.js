require("dotenv").config();

const http = require("node:http");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const handleDeleteLastCommand = require("./commands/deleteLast");
const handleFamilyCommand = require("./commands/family");
const handleListCommand = require("./commands/list");
const handleSummaryCommand = require("./commands/summary");
const prisma = require("./db/prisma");
const { parseExpenseMessage } = require("./parser");
const { saveTransaction } = require("./services/transactionService");
const { formatAmount } = require("./utils/formatters");
const { getCommand, hasAmount } = require("./utils/helpers");

// Required environment variables for Discord, PostgreSQL, and the channel gate.
const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const expenseChannelId = process.env.EXPENSE_CHANNEL_ID;
const port = process.env.PORT || 3000;

if (!token) {
  console.error("Missing DISCORD_BOT_TOKEN. Set it in Render, or use DISCORD_TOKEN locally.");
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

const healthServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Discord Expense Tracker Bot is running");
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "not_found" }));
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot is ready as ${readyClient.user.tag}`);
  console.log(`Processing expenses only in channel ${expenseChannelId}`);
});

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
    const transaction = await saveTransaction(parsedExpense, discordUserId, username);

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
    healthServer.close();
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

  healthServer.listen(port, () => {
    console.log(`HTTP health server listening on port ${port}.`);
  });

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
