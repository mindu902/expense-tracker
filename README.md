# discord-expense-tracker

A local Node.js Discord bot starter for a personal expense tracker.

## Requirements

- Node.js 18 or newer
- A Discord bot token from the Discord Developer Portal

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start local PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

4. Add your Discord bot token, database URL, and expense channel ID to `.env`:

   ```env
   DISCORD_TOKEN=your_real_bot_token_here
   DATABASE_URL="postgresql://expense_user:expense_password@localhost:5432/discord_expense_tracker?schema=public"
   EXPENSE_CHANNEL_ID=1507548367700492308
   ```

5. Generate the Prisma client:

   ```bash
   npm run prisma:generate
   ```

6. Create and apply the initial Prisma migration:

   ```bash
   npm run prisma:migrate -- --name init
   ```

7. Start the bot in development mode:

   ```bash
   npm run dev
   ```

   Or run it without nodemon:

   ```bash
   npm start
   ```

8. Run parser tests:

   ```bash
   npm test
   ```

## Environment Variables

Create `.env` from `.env.example` and set:

```env
DISCORD_TOKEN=your_real_bot_token_here
DATABASE_URL="postgresql://expense_user:expense_password@localhost:5432/discord_expense_tracker?schema=public"
EXPENSE_CHANNEL_ID=1507548367700492308
```

`DISCORD_TOKEN` is your Discord bot token. `DATABASE_URL` points Prisma to PostgreSQL. `EXPENSE_CHANNEL_ID` limits the bot to one Discord channel in production.

## Run Locally

Start PostgreSQL, apply migrations, then run the bot:

```bash
docker compose up -d
npm run prisma:generate
npm run prisma:migrate -- --name init
npm start
```

For development with automatic restarts:

```bash
npm run dev
```

When the bot connects successfully, it prints:

```text
Bot is ready
```

## Message Handling

The bot listens for Discord messages in `EXPENSE_CHANNEL_ID` and ignores messages from bots or other channels. It records messages that include an amount.

For example, when a user sends:

```text
咖啡 5
```

The bot logs the raw text, Discord user ID, username, channel ID, and timestamp, then replies:

```text
已记录：Food $5 - 咖啡
```

Parsed messages use `CAD` as the default currency. Messages that start with `收入` or include income keywords such as `工资`, `salary`, or `income` are treated as `INCOME`; other amount messages are treated as `EXPENSE`.

The parser also assigns a rule-based category without AI or external APIs:

- `Food`: `咖啡`, `午饭`, `晚饭`, `早餐`, `restaurant`, `starbucks`
- `Grocery`: `costco`, `walmart`, `grocery`, `大统华`, `T&T`
- `Transport`: `uber`, `lyft`, `ttc`, `gas`, `parking`
- `Baby`: `daycare`, `diaper`, `奶粉`, `toy`
- `Income`: `工资`, `salary`, `income`
- `Other`: default

Each parsed message is saved to PostgreSQL with Prisma. The bot upserts the Discord user by `discordUserId`, then creates a transaction with the parsed type, description, amount, currency, category, raw text, Discord user ID, username, and creation time.

## Commands

Commands do not need a prefix. If you are in a family ledger, `list`, `summary`, and `delete last` use the shared family records.

Show the last 10 transactions:

```text
list
```

Show this month's total income, total expense, and balance:

```text
summary
```

Delete your most recent transaction:

```text
delete last
```

Create a family ledger and receive an invite code:

```text
family create My Family
```

Join a family ledger with an invite code:

```text
family join A1B2C3
```

Show your current family ledger:

```text
family
```

Leave your current family ledger:

```text
family leave
```

If there are no transactions, the bot replies with a clear Chinese message instead of failing.

## Prisma Commands

Generate the Prisma client:

```bash
npm run prisma:generate
```

Create and apply a migration:

```bash
npm run prisma:migrate -- --name init
```

Open Prisma Studio:

```bash
npm run prisma:studio
```

## Discord Developer Portal Notes

Create an application and bot at the [Discord Developer Portal](https://discord.com/developers/applications), then copy the bot token into your local `.env` file.

This starter uses the `Guilds`, `GuildMessages`, and `MessageContent` intents. In the Discord Developer Portal, enable the Message Content Intent for your bot so it can read message text.
