# main.py
import utils

def calculate():
    x = utils.add(2, 3)
    y = utils.multiply(x, utils.CONSTANT_VALUE)
    return y

def run():
    result = calculate()
    greeter = utils.Greeter("AST Explorer")
    message = greeter.greet()
    print(message)
    print("Result:", result)

if __name__ == "__main__":
    run()
