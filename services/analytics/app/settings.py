from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded only inside the analytics service."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "Asiri Analytics Engine"
    service_version: str = "7.4.0"
    asiri_analytics_token: str = ""
    financial_modeling_prep_key: str = ""
    request_timeout_seconds: int = 45
    cache_ttl_seconds: int = 900
    trading_enabled: bool = False


settings = Settings()
