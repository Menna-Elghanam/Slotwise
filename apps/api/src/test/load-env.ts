// Vitest doesn't read env files by itself. Tests always use the test database settings.
process.loadEnvFile(".env.test");
