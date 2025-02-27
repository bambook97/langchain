import * as dotenv from 'dotenv';
import { Pool, PoolConfig } from 'pg';

// Загружаем переменные окружения
dotenv.config();

const DROP_TABLES = `
    DROP TABLE IF EXISTS code_records;
    DROP TABLE IF EXISTS code_vectors;
`;

const CREATE_RECORDS_TABLE = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- для gen_random_uuid()

CREATE TABLE IF NOT EXISTS code_records (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  namespace TEXT NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL,
  group_id TEXT,
  UNIQUE ("key", namespace)
);
`;

const CREATE_VECTORS_TABLE = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS code_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  metadata JSONB,
  vector VECTOR(768)
);

CREATE INDEX IF NOT EXISTS code_vectors_vector_idx
ON code_vectors USING hnsw (vector vector_l2_ops);
`;

async function recreateSchema() {
    const dbConfig = {
        host: process.env.DB_HOST || "127.0.0.1",
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "postgres",
        database: process.env.DB_NAME || "langchain",
    } as PoolConfig;

    const pool = new Pool(dbConfig);

    try {
        console.log("Dropping existing tables...");
        await pool.query(DROP_TABLES);

        console.log("Creating code_records table...");
        await pool.query(CREATE_RECORDS_TABLE);

        console.log("Creating code_vectors table...");
        await pool.query(CREATE_VECTORS_TABLE);

        console.log("Schema recreated successfully!");
    } catch (error) {
        console.error("Error recreating schema:", error);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    recreateSchema().catch(console.error);
}

export { recreateSchema };
