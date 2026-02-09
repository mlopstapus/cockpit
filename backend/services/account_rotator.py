"""Account rotation and rate limit management."""
import logging
import time
from datetime import datetime, date
from config import settings, AccountConfig

logger = logging.getLogger(__name__)


class AccountState:
    """Runtime state for a single account."""

    def __init__(self, config: AccountConfig):
        self.config = config
        self.messages_today: int = 0
        self.last_reset_date: date = date.today()
        self.is_rate_limited: bool = False
        self.rate_limit_until: float = 0  # Unix timestamp
        self.active_sessions: int = 0

    @property
    def id(self) -> str:
        return self.config.id

    @property
    def name(self) -> str:
        return self.config.name

    @property
    def config_dir(self) -> str:
        return self.config.config_dir

    @property
    def usage_pct(self) -> float:
        if self.config.daily_message_estimate == 0:
            return 100.0
        return (self.messages_today / self.config.daily_message_estimate) * 100

    def reset_if_new_day(self):
        today = date.today()
        if self.last_reset_date < today:
            self.messages_today = 0
            self.last_reset_date = today
            self.is_rate_limited = False
            logger.info(f"Account {self.id} daily usage reset")


class AccountRotator:
    """Manages multiple Claude subscription accounts with rotation."""

    def __init__(self):
        self.accounts: dict[str, AccountState] = {}
        for account_config in settings.accounts:
            self.accounts[account_config.id] = AccountState(account_config)

    def get_account(self, account_id: str) -> AccountState:
        """Get a specific account by ID."""
        account = self.accounts.get(account_id)
        if not account:
            raise ValueError(f"Unknown account: {account_id}")
        return account

    def get_best_account(self) -> AccountState:
        """Pick the best available account.

        Strategy:
        1. Filter out rate-limited accounts
        2. Reset daily limits if needed
        3. Pick by priority, then by remaining capacity
        """
        now = time.time()

        available = []
        for account in self.accounts.values():
            account.reset_if_new_day()

            # Check if rate limit has expired
            if account.is_rate_limited and now > account.rate_limit_until:
                account.is_rate_limited = False
                logger.info(f"Account {account.id} rate limit expired")

            if not account.is_rate_limited:
                available.append(account)

        if not available:
            raise RuntimeError(
                "All accounts are rate limited. "
                f"Next available: {self._next_available_time()}"
            )

        # Sort by: priority (lower first), then by remaining capacity (higher first)
        available.sort(
            key=lambda a: (a.config.priority, -a.config.daily_message_estimate + a.messages_today)
        )

        return available[0]

    def increment_usage(self, account_id: str):
        """Record a message sent on this account."""
        account = self.accounts.get(account_id)
        if account:
            account.messages_today += 1

    def mark_rate_limited(self, account_id: str, retry_after_seconds: int = 7200):
        """Mark an account as rate limited.

        Default retry is 2 hours — Claude Pro limits typically reset
        within this window.
        """
        account = self.accounts.get(account_id)
        if account:
            account.is_rate_limited = True
            account.rate_limit_until = time.time() + retry_after_seconds
            logger.warning(
                f"Account {account_id} rate limited. "
                f"Retry after {retry_after_seconds}s"
            )

    def get_all_status(self) -> list[dict]:
        """Get status of all accounts."""
        result = []
        for account in self.accounts.values():
            account.reset_if_new_day()
            result.append({
                "id": account.id,
                "name": account.name,
                "tier": account.config.tier,
                "priority": account.config.priority,
                "is_rate_limited": account.is_rate_limited,
                "messages_today": account.messages_today,
                "daily_estimate": account.config.daily_message_estimate,
                "usage_pct": round(account.usage_pct, 1),
                "active_sessions": account.active_sessions,
            })
        return result

    def _next_available_time(self) -> str:
        """Get earliest time an account becomes available."""
        times = [
            a.rate_limit_until
            for a in self.accounts.values()
            if a.is_rate_limited and a.rate_limit_until > 0
        ]
        if times:
            earliest = min(times)
            return datetime.fromtimestamp(earliest).strftime("%H:%M:%S")
        return "unknown"
