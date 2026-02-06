# sample.py
import json

class DataProcessor:
    def __init__(self, data):
        self.data = data
        self.status = "initialized"
    
    def process(self, threshold):
        # Filter data based on a threshold
        filtered = [x for x in self.data if x > threshold]
        return len(filtered)