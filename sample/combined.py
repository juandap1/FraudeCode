# Combined script merging utils.py, main.py, and sample.py
# Fixed missing subtract call by adding the subtract function

# === From utils.py ===
def add(a, b):
    return a + b

def multiply(a, b):
    return a * b

# Perform division operation while checking for potential division by zero error
def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

# Fixed: Added missing subtract function
def subtract(a, b):
    return a - b

CONSTANT_VALUE = 5

class Greeter:
    def __init__(self, name):
        self.name = name

    def greet(self):
        message = "Hello, " + self.name + "!"
        return message

# === From main.py ===
def calculate():
    x = add(2, 3)
    y = multiply(x, CONSTANT_VALUE)
    z = subtract(y, x)
    return z

def power(base, exponent):
    result = base ** exponent
    return result

def run():
    result = calculate()
    greeter = Greeter("AST Explorer")
    message = greeter.greet() + "."
    print(message)
    print("Result:", result)

# === From sample.py ===
import json

class DataProcessor:
    def __init__(self, data):
        self.data = data
        self.status = "initialized"
    
    def process(self, threshold):
        # Filter data based on a threshold
        filtered = [x for x in self.data if x > threshold]
        return len(filtered)

# === Main execution ===
if __name__ == "__main__":
    run()
    
    # Example usage of DataProcessor
    processor = DataProcessor([10, 20, 30, 40, 50])
    count = processor.process(25)
    print(f"Items above threshold: {count}")
