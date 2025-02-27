// src/retrieval.ts
import * as dotenv from 'dotenv';
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PoolConfig } from "pg";
import { OllamaEmbeddings } from "@langchain/ollama";

// Загружаем переменные окружения
dotenv.config();

// Конфигурация подключения к PostgreSQL
const dbConfig = {
    postgresConnectionOptions: {
        type: "postgres",
        host: process.env.DB_HOST || "127.0.0.1",
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "postgres",
        database: process.env.DB_NAME || "langchain",
    } as PoolConfig,
    tableName: process.env.VECTOR_TABLE || "code_vectors",
    columns: {
        idColumnName: "id",
        vectorColumnName: "vector",
        contentColumnName: "content",
        metadataColumnName: "metadata",
    },
};

// Функция для поиска по проиндексированным документам
async function searchVectorStore(query: string, topK: number = 3): Promise<void> {
    console.log(`Searching for: "${query}"`);

    try {
        // Инициализируем эмбеддинги
        const embeddings = new OllamaEmbeddings({
            model: 'nomic-embed-text'
        });
        // Подключаемся к существующему векторному хранилищу
        console.log("Connecting to vector store...");
        const vectorStore = await PGVectorStore.initialize(
            embeddings,
            dbConfig
        );

        // Выполняем поиск
        console.log(`Looking for ${topK} most similar documents...`);
        const results = await vectorStore.similaritySearch(query, topK);

        // Выводим результаты
        console.log(`\nFound ${results.length} results:\n`);

        results.forEach((doc, i) => {
            console.log(`Result ${i + 1}:`);
            console.log(`Source: ${doc.metadata.source}`);
            console.log(`Content (preview): ${doc.pageContent.substring(0, 200)}...`);
            console.log("-".repeat(80));
        });

        // Закрываем соединение
        await vectorStore.end();

    } catch (error) {
        console.error("Error during search:", error);
    }
}

// Обработка аргументов командной строки
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Error: Search query is required');
        console.error('Usage: ts-node src/retrieval.ts "your search query" [topK]');
        process.exit(1);
    }

    const query = args[0];
    const topK = args[1] ? parseInt(args[1]) : 3;

    await searchVectorStore(query, topK);
}

// Запускаем, если запущено напрямую
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

export { searchVectorStore };