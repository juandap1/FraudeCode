# Hello World

## Topics Covered
- Setting up a Rust project
- `fn main` entry point
- Defining functions
- Printing to the console with `println!`

## Introduction
In this lesson you'll learn how to write the classic **Hello, World!** program in Rust. This program demonstrates the basic structure of a Rust program, how to define a function, and how to output text to the console.

## Concepts
- **`fn main()`**: The entry point of every Rust executable. The code inside `main` runs when you execute the program.
- **Functions**: Reusable blocks of code. We'll create a simple function `greet` that returns a greeting string.
- **`println!` macro**: Used to print text followed by a newline to the console. It's similar to `print` in other languages.

## Task
Create a function named `greet` that returns the string `"Hello, world!"`. Then, modify the `main` function to call `greet` and print its result using `println!`.

### Expected Output
When you run the program, it should print exactly:
```
Hello, world!
```

## How to Run
1. Open a terminal and navigate to the learning directory.
2. Build and run the program with:
   ```
   cargo run --quiet
   ```
   (The `--quiet` flag suppresses Cargo's build output, showing only the program's output.)

Make sure the output matches the expected output above.

Good luck!