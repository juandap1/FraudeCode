def add(a, b):
    return a + b

def multiply(a, b):
    return a * b

CONSTANT_VALUE = 5

class Greeter:
    def __init__(self, name):
        self.name = name

    def greet(self):
        message = "Hello, " + self.name + "!"
        return message
