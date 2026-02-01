# Introduction to Rust

Welcome to the course! This curriculum is designed to take you from a Rust beginner to building high-performance applications

## Why Rust?

Rust is a systems programming language designed for safety, speed, and concurrency. It achieves memory safety without a garbage collector through its innovative ownership system, which catches potential bugs at compile time. This makes Rust an ideal choice for performance-critical applications where reliability is paramount.

What makes Rust special:

- **Memory Safety**: Guarantees safety without the overhead of a garbage collector.
- **Performance**: Offers the speed and control of C and C++.
- **Concurrency**: Prevents data races at compile time, making multi-threaded programming safer.

Popular use cases for Rust include building high-performance web services, systems software, game engines, and WebAssembly modules for the browser. By compiling Rust to WASM, we can bring near-native performance to web applications, enabling heavy logic and complex simulations to run smoothly.

## Getting Started

To follow along with the exercises and compile the code, you need to have **Rust**, the appropriate **WASM target**, and **Bun** installed on your machine.

- **Rust**: The primary compiler for building your applications.
- **WASM Target**: Allows us to compile Rust into a portable format that runs in our environment.
- **Bun**: Used to execute the compiled WebAssembly modules.

### 1. Install Rust

If you don't have Rust installed, follow the instructions at [rustup.rs](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Add WASM Target

We will be targeting `wasm32-wasip1` to ensure our code can run in a variety of environments. Install it using rustup:

```bash
rustup target add wasm32-wasip1
```

### 3. Install Bun

If you don't have Bun installed, follow the instructions at [bun.sh](https://bun.sh/):

```bash
curl -fsSL https://bun.sh/install | bash
```

### 4. Verify Installation

Ensure all tools are in your PATH. You can verify the installation by running:

```bash
rustc --version
bun --version
rustup target list --installed | grep wasm32-wasip1
```
