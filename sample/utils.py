# utils.py

CONSTANT_VALUE = 42

def add(a, b):
    return a + b

def multiply(a, b):
    return a * b

class Greeter:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return f"Hello, {self.name}!"
