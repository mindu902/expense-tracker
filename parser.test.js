const assert = require("node:assert/strict");

const { parseExpenseMessage } = require("./src/parser");

const testCases = [
  {
    input: "+咖啡 5",
    expected: {
      type: "EXPENSE",
      description: "咖啡",
      amount: 5,
      currency: "CAD",
      category: "Food",
      rawText: "+咖啡 5"
    }
  },
  {
    input: "+Costco 120",
    expected: {
      type: "EXPENSE",
      description: "Costco",
      amount: 120,
      currency: "CAD",
      category: "Grocery",
      rawText: "+Costco 120"
    }
  },
  {
    input: "+收入 工资 5000",
    expected: {
      type: "INCOME",
      description: "工资",
      amount: 5000,
      currency: "CAD",
      category: "Income",
      rawText: "+收入 工资 5000"
    }
  },
  {
    input: "工资 5000",
    expected: {
      type: "INCOME",
      description: "工资",
      amount: 5000,
      currency: "CAD",
      category: "Income",
      rawText: "工资 5000"
    }
  },
  {
    input: "+Uber 18.75",
    expected: {
      type: "EXPENSE",
      description: "Uber",
      amount: 18.75,
      currency: "CAD",
      category: "Transport",
      rawText: "+Uber 18.75"
    }
  },
  {
    input: "+奶粉 42",
    expected: {
      type: "EXPENSE",
      description: "奶粉",
      amount: 42,
      currency: "CAD",
      category: "Baby",
      rawText: "+奶粉 42"
    }
  },
  {
    input: "+book 14",
    expected: {
      type: "EXPENSE",
      description: "book",
      amount: 14,
      currency: "CAD",
      category: "Other",
      rawText: "+book 14"
    }
  },
  {
    input: "早餐 15",
    expected: {
      type: "EXPENSE",
      description: "早餐",
      amount: 15,
      currency: "CAD",
      category: "Food",
      rawText: "早餐 15"
    }
  }
];

for (const { input, expected } of testCases) {
  assert.deepEqual(parseExpenseMessage(input), expected);
}

assert.throws(() => parseExpenseMessage("+咖啡"), /include an amount/);

console.log("Parser tests passed");
