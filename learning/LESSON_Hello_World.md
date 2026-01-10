# Hello World Lesson

## Title
**Hello World in Rust**

## Topics Covered
- Setting up a Rust project
- The `main` function
- Printing to the console with `println!`
- Basic Cargo commands (`cargo run`)

## Lesson Content
Rust programs start execution from the `main` function.  To output text to the console you use the `println!` macro, which works similarly to `print` statements in other languages but requires an exclamation mark because it is a macro.

```rust
fn main() {
    println!("Hello, world!");
}
```

When you run a Rust program using Cargo (Rust’s package manager and build tool), Cargo will compile the code and then execute the resulting binary.

## Task
Create a Rust program that prints the following exact line to the console:
```
Hello, Rust learner!
```

### Requirements
- Do **not** change the name of the `main` function.
- Use the `println!` macro to output the text.
- The output must match exactly, including capitalization and punctuation.

### How to Run Your Code
1. Open a terminal and navigate to the `learning` directory.
2. Run the command `cargo run`.
3. You should see the expected output printed to the console.

### Verification
When you run `cargo run`, the program should terminate without errors and display:
```
Hello, Rust learner!
```
If the output matches, you have successfully completed the lesson.

---

**Happy coding!**
