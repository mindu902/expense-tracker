const CATEGORY_KEYWORDS = [
  {
    category: "Food",
    keywords: ["咖啡", "午饭", "晚饭", "早餐", "restaurant", "starbucks"]
  },
  {
    category: "Grocery",
    keywords: ["costco", "walmart", "grocery", "大统华", "t&t"]
  },
  {
    category: "Transport",
    keywords: ["uber", "lyft", "ttc", "gas", "parking"]
  },
  {
    category: "Baby",
    keywords: ["daycare", "diaper", "奶粉", "toy"]
  },
  {
    category: "Income",
    keywords: ["工资", "salary", "income"]
  }
];

const INCOME_KEYWORDS = ["工资", "salary", "income"];

function classifyCategory(type, description) {
  const normalizedDescription = description.toLowerCase();

  // Category/account is inferred by simple keyword matching, not AI.
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => normalizedDescription.includes(keyword))) {
      return category;
    }
  }

  if (type === "INCOME") {
    return "Income";
  }

  return "Other";
}

function isIncomeDescription(description) {
  const normalizedDescription = description.toLowerCase();

  return (
    description.startsWith("收入") ||
    INCOME_KEYWORDS.some((keyword) => normalizedDescription.includes(keyword))
  );
}

function parseExpenseMessage(rawText) {
  if (typeof rawText !== "string") {
    throw new Error("Message text must be a string.");
  }

  const trimmedRawText = rawText.trim();

  // Messages may include a command-style prefix; parsing keeps rawText unchanged.
  const messageText = trimmedRawText.replace(/^[+!！/]/, "").trim();

  if (!messageText) {
    throw new Error("Expense message is empty.");
  }

  const amountMatches = [...messageText.matchAll(/\d+(?:\.\d+)?/g)];

  if (amountMatches.length === 0) {
    throw new Error("Expense message must include an amount.");
  }

  const amountMatch = amountMatches[amountMatches.length - 1];
  const amountText = amountMatch[0];
  const amount = Number(amountText);

  if (!Number.isFinite(amount)) {
    throw new Error("Expense amount is invalid.");
  }

  const beforeAmount = messageText.slice(0, amountMatch.index);
  const afterAmount = messageText.slice(amountMatch.index + amountText.length);
  let description = `${beforeAmount}${afterAmount}`.trim().replace(/\s+/g, " ");

  const type = isIncomeDescription(description) ? "INCOME" : "EXPENSE";

  if (description.startsWith("收入")) {
    description = description.slice("收入".length).trim();
  }

  if (!description) {
    throw new Error("Expense message must include a description.");
  }

  const category = classifyCategory(type, description);

  return {
    type,
    description,
    amount,
    currency: "CAD",
    category,
    rawText: trimmedRawText
  };
}

module.exports = {
  classifyCategory,
  parseExpenseMessage
};
