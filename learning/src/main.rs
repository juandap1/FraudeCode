// LESSON_Hello_World.md
// Task: Implement the `greet` function to return "Hello, world!" and use it in `main`.

fn greet() -> &'static str {
    // TODO: Return the greeting string.
    // Hint: The string should be exactly "Hello, world!"
    "Hello, world!"
}

fn main() {
    // Call the greet function and print its result.
    // Use the `println!` macro to output the string.
    println!("{}", greet());
}
