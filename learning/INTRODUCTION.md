# Introduction to Rust

Rust is a modern systems programming language focused on safety, speed, and concurrency. It empowers developers to write low‑level code without sacrificing high‑level ergonomics.

## Common Uses
- **Systems programming** – operating systems, device drivers, embedded firmware.
- **Web services** – fast, reliable back‑ends (e.g., using Actix, Rocket, Warp).
- **Command‑line tools** – performant utilities with a pleasant developer experience.
- **Game development** – high‑performance engines and tooling.
- **WebAssembly** – compile Rust to WASM for web applications.

## Notable Features
- **Memory safety without a garbage collector** – the ownership model guarantees no data races or dangling pointers.
- **Zero‑cost abstractions** – high‑level constructs compile down to efficient machine code.
- **Powerful type system** – traits, generics, pattern matching, and algebraic data types.
- **Excellent tooling** – `cargo` for package management, `rustc` compiler, and integrated testing.
- **Great community & ecosystem** – crates.io hosts hundreds of thousands of reusable libraries.

---

## Getting Started – What to Download
1. **Install Rust** – the easiest way is via `rustup`, the official installer and toolchain manager.
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   This installs:
   - `rustc` (the compiler)
   - `cargo` (the build system and package manager)
   - `rust‑fmt` and `clippy` (code formatting and linting tools)
2. **Add Rust to your PATH** – the installer usually does this automatically. Restart your terminal and run `rustc --version` to verify.

### Optional Quality‑of‑Life Tools (keep it simple)
- **VS Code** with the *Rust Analyzer* extension for IDE features.
- **rustup component add rust-src** – needed for some IDEs.
- **cargo-edit** – `cargo add`, `cargo rm`, `cargo upgrade` for managing dependencies.

---

## Initialise a New Rust Project
Navigate to the learning directory (or any folder where you want the project) and run:
```bash
cargo init   # creates a new binary crate in the current folder
# or
cargo new my_project   # creates a new folder named `my_project`
```
This will generate a `Cargo.toml` manifest and a `src/main.rs` starter file. You can now build and run your program with:
```bash
cargo run
```
Happy coding!
