# This class represents a stock in the market
class Stock:
    def __init__(self, symbol, name):
        self.symbol = symbol
        self.name = name
        self.prices = []
        self.market_cap = None
        self.pe_ratio = None
        self.eps = None
        self.sector = None
        self.industry = None
        self.dividend_yield = None

    def add_price(self, price):
        """Add a price to the stock's price history."""
        self.prices.append(price)

    def get_average_price(self):
        """Calculate the average price of the stock."""
        if not self.prices:
            raise ValueError("No prices available to calculate average")
        return sum(self.prices) / len(self.prices)

    def get_max_price(self):
        """Get the maximum price of the stock."""
        if not self.prices:
            raise ValueError("No prices available to determine maximum price")
        return max(self.prices)

    def get_min_price(self):
        """Get the minimum price of the stock."""
        if not self.prices:
            raise ValueError("No prices available to determine minimum price")
        return min(self.prices)

    def get_latest_price(self):
        """Get the most recent price of the stock."""
        if not self.prices:
            raise ValueError("No prices available to determine latest price")
        return self.prices[-1]

    def set_market_cap(self, market_cap):
        """Set the market capitalization of the stock."""
        self.market_cap = market_cap

    def get_market_cap(self):
        """Get the market capitalization of the stock."""
        return self.market_cap

    def set_pe_ratio(self, pe_ratio):
        """Set the P/E ratio of the stock."""
        self.pe_ratio = pe_ratio

    def get_pe_ratio(self):
        """Get the P/E ratio of the stock."""
        return self.pe_ratio

    def set_eps(self, eps):
        """Set the earnings per share of the stock."""
        self.eps = eps

    def get_eps(self):
        """Get the earnings per share of the stock."""
        return self.eps

    def set_sector(self, sector):
        """Set the sector of the stock."""
        self.sector = sector

    def get_sector(self):
        """Get the sector of the stock."""
        return self.sector

    def set_industry(self, industry):
        """Set the industry of the stock."""
        self.industry = industry

    def get_industry(self):
        """Get the industry of the stock."""
        return self.industry

    def set_dividend_yield(self, dividend_yield):
        """Set the dividend yield of the stock."""
        self.dividend_yield = dividend_yield

    def get_dividend_yield(self):
        """Get the dividend yield of the stock."""
        return self.dividend_yield