def add(a, b):
    return a + b

def multiply(a, b):
    return a * b

# Perform division operation while checking for potential division by zero error
def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

CONSTANT_VALUE = 5

class Greeter:
    def __init__(self, name):
        self.name = name

    def greet(self):
        message = "Hello, " + self.name + "!"
        return message
