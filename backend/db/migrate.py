"""Database migration utilities.

For Phase 0 MVP, we're using simple schema creation via SQLAlchemy.
For production, consider using Alembic for proper migration management.
"""
import asyncio
import logging
from .database import init_db, engine, Base

logger = logging.getLogger(__name__)


async def create_tables():
    """Create all tables from scratch."""
    logger.info("Creating database tables...")
    await init_db()
    logger.info("✓ Tables created successfully")


async def drop_tables():
    """Drop all tables (DESTRUCTIVE - use with caution)."""
    logger.warning("Dropping all database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.info("✓ Tables dropped")


async def reset_database():
    """Reset database: drop all tables and recreate."""
    await drop_tables()
    await create_tables()


if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) < 2:
        print("Usage: python -m db.migrate <command>")
        print("Commands:")
        print("  create   - Create all tables")
        print("  drop     - Drop all tables (DESTRUCTIVE)")
        print("  reset    - Drop and recreate all tables (DESTRUCTIVE)")
        sys.exit(1)

    command = sys.argv[1]

    if command == "create":
        asyncio.run(create_tables())
    elif command == "drop":
        asyncio.run(drop_tables())
    elif command == "reset":
        asyncio.run(reset_database())
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
