import { getGeneralModel, getThinkerModel } from "../src/services/llm";
import ModificationCodeChangesPrompt from "../src/types/prompts/modify/CodeChanges";
import FastCodeChangesPrompt from "../src/types/prompts/modify/FastChanges";
import ModificationThinkPrompt from "../src/types/prompts/modify/Think";

const start = Date.now();

const codeChanges = `FILE: utils.py
CODE:
1: def add(a, b):
2:     return a + b
3: [EMPTY LINES]
4: def multiply(a, b):
5:     return a * b
6: [EMPTY LINES]
7 - 7: CONSTANT_VALUE = 5 ...
8: [EMPTY LINES]
9 - 15: class Greeter: ...`;
const patchTask =
  "IN utils.py: Add a new function called division that takes num1 and num2 parameters and returns their quotient. Insert this function before the CONSTANT_VALUE definition (lines 7-8 in utils.py)";

const sqrtTask =
  "Add a function `sqrt` to compute the square root of a number using `math.sqrt` or another method.";

const codeContext2 = `FILE: main.py
CODE:
1 - 1: import utils ...
2: [EMPTY LINES]
3: def calculate():
4:     x = utils.add(2, 3)
5:     y = utils.multiply(x, utils.CONSTANT_VALUE)
6:     z = utils.subtract(y, x)
7:     return z
8: [EMPTY LINES]
9: def power(base, exponent):
10:     result = base ** exponent
11:     return result
12: [EMPTY LINES]
13: def run():
14:     result = calculate()
15:     greeter = utils.Greeter("AST Explorer")
16:     message = greeter.greet() + "."
17:     print(message)
18:     print("Result:", result)
19: [EMPTY LINES]
20 - 21: if __name__ == "__main__": ...`;

const task2 =
  "IN main.py: Modify the calculate function to replace the call to utils.subtract with a call to utils.division. Update line 6 to use the new division method instead of subtract.";

const pyTask =
  "Add a function `sqrt` to compute the square root of a number using `math.sqrt` or another method.";

const prompt = FastCodeChangesPrompt(
  codeChanges + "\n\n" + codeContext2,
  pyTask
);

const stream = await getGeneralModel().stream(prompt);

// const prompt = ModificationThinkPrompt(
//   codeChanges + "\n\n" + codeContext2,
//   "Create a new method called division that takes two parameters, num1 and num2, and returns their quotient. Then, modify the existing calculate function to call this new division method."
// );

// const stream = await getThinkerModel().stream(prompt);

for await (const chunk of stream) {
  process.stdout.write(chunk.content as string);
}

const end = Date.now();
const durationMs = end - start;

console.log("\n\n✅ Stream complete!");
console.log(`⏱ Duration: ${durationMs}ms`);
