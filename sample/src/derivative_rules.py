# This file contains various methods for computing derivatives of functions.
# Each method uses a different numerical approach to estimate the derivative at a given point.

# This function computes the derivative using the basic difference quotient method
# Parameters:
# f: The function for which the derivative is to be computed
# x: The point at which the derivative is to be computed
# h: The step size for the difference quotient (default is 1e-5)
# Returns: The approximate derivative of the function at the given point

def basic_derivative(f, x, h=1e-5):
    """Compute the derivative of a function at a point using the basic difference quotient."""
    return (f(x + h) - f(x)) / h

# This function computes the derivative using the central difference method
# Parameters:
# f: The function for which the derivative is to be computed
# x: The point at which the derivative is to be computed
# h: The step size for the difference quotient (default is 1e-5)
# Returns: The approximate derivative of the function at the given point

def central_difference(f, x, h=1e-5):
    """Compute the derivative of a function at a point using the central difference method."""
    return (f(x + h) - f(x - h)) / (2 * h)

# This function computes the second derivative of a function at a point
# Parameters:
# f: The function for which the second derivative is to be computed
# x: The point at which the second derivative is to be computed
# h: The step size for the difference quotient (default is 1e-5)
# Returns: The approximate second derivative of the function at the given point

def second_derivative(f, x, h=1e-5):
    """Compute the second derivative of a function at a point."""
    return (f(x + h) - 2 * f(x) + f(x - h)) / h**2

# This function computes the derivative using the forward difference method
# Parameters:
# f: The function for which the derivative is to be computed
# x: The point at which the derivative is to be computed
# h: The step size for the difference quotient (default is 1e-5)
# Returns: The approximate derivative of the function at the given point

def forward_difference(f, x, h=1e-5):
    """Compute the derivative of a function at a point using the forward difference method."""
    return (f(x + h) - f(x)) / h

# This function computes the derivative using the backward difference method
# Parameters:
# f: The function for which the derivative is to be computed
# x: The point at which the derivative is to be computed
# h: The step size for the difference quotient (default is 1e-5)
# Returns: The approximate derivative of the function at the given point

def backward_difference(f, x, h=1e-5):
    """Compute the derivative of a function at a point using the backward difference method."""
    return (f(x) - f(x - h)) / h
