import sys
from pathlib import Path

from loguru import logger


def setup_logging(log_dir: str = "logs", log_level: str = "INFO", retention_days: int = 14) -> None:
    """Configure loguru sinks: console + rotating app.log + rotating error.log."""
    Path(log_dir).mkdir(parents=True, exist_ok=True)

    logger.remove()  # drop the default stderr handler

    logger.add(
        sys.stderr,
        level=log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level:<8}</level> | {name}:{line} | {message}",
        colorize=True,
    )

    logger.add(
        Path(log_dir) / "app.log",
        level="DEBUG",
        rotation="50 MB",
        retention=f"{retention_days} days",
        serialize=True,   # JSON format
        enqueue=True,     # non-blocking write
    )

    logger.add(
        Path(log_dir) / "error.log",
        level="ERROR",
        rotation="50 MB",
        retention="30 days",
        serialize=True,
        enqueue=True,
    )
