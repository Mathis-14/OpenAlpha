class UpstreamDataError(Exception):
    """Raised when an external data provider returns no usable data."""

    def __init__(self, provider: str, detail: str = "") -> None:
        self.provider = provider
        self.detail = detail
        super().__init__(f"{provider}: {detail}")


class InvalidTickerError(Exception):
    """Raised when a ticker symbol cannot be resolved."""

    def __init__(self, ticker: str) -> None:
        self.ticker = ticker
        super().__init__(f"Invalid ticker: {ticker}")


class ProviderTimeoutError(Exception):
    """Raised when an external call exceeds its timeout budget."""

    def __init__(self, provider: str) -> None:
        self.provider = provider
        super().__init__(f"Timeout: {provider}")
