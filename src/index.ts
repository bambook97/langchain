// src/indexDir.ts
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PoolConfig } from 'pg';
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { PostgresRecordManager } from "@langchain/community/indexes/postgres";
import { index } from "langchain/indexes";
import { OllamaEmbeddings } from "@langchain/ollama";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { JSONLoader } from "langchain/document_loaders/fs/json";

// Загружаем переменные окружения
dotenv.config();

// Конфигурация подключения к PostgreSQL (пример)
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

const recordManagerConfig = {
    postgresConnectionOptions: {
        type: "postgres",
        host: process.env.DB_HOST || "127.0.0.1",
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "postgres",
        database: process.env.DB_NAME || "langchain",
    } as PoolConfig,
    tableName: process.env.RECORD_TABLE || "code_records",
};

// Функция для индексации целой директории
async function indexDirectory(dirPath: string, namespace: string = "code_index"): Promise<void> {
    console.log(`Indexing directory: ${dirPath}`);

    // Проверяем существование директории
    if (!fs.existsSync(dirPath)) {
        console.error(`Directory not found: ${dirPath}`);
        return;
    }

    try {
        // 1. Загружаем все файлы из директории (рекурсивно)
        //    Указываем, какие расширения нас интересуют:
        const loader = new DirectoryLoader(dirPath, {
            ".ts": (filePath) => new TextLoader(filePath),
            ".js": (filePath) => new TextLoader(filePath),
            ".md": (filePath) => new TextLoader(filePath),
            ".tsx": (filePath) => new TextLoader(filePath),
            ".jsx": (filePath) => new TextLoader(filePath),
            ".map": (filePath) => new TextLoader(filePath),
        });
        const docs: Document[] = await loader.load();
        console.log(`Loaded ${docs.length} documents from ${dirPath}`);

        // 2. Разбиваем документы на чанки
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 2000,
            chunkOverlap: 400,
        });
        const splittedDocs = await textSplitter.splitDocuments(docs);
        console.log(`Split into ${splittedDocs.length} chunks`);

        // 3. Инициализируем эмбеддинги (Ollama в примере)
        const embeddings = new OllamaEmbeddings({
            model: 'nomic-embed-text'
        });

        // 4. Создаем VectorStore (PGVectorStore)
        console.log("Initializing vector store...");
        const vectorStore = await PGVectorStore.initialize(embeddings, dbConfig);

        // 5. Создаем PostgresRecordManager
        console.log("Creating record manager...");
        const recordManager = new PostgresRecordManager(namespace, recordManagerConfig);

        // 6. Индексируем документы
        console.log("Indexing documents...");
        const indexResult = await index({
            docsSource: splittedDocs,
            recordManager,
            vectorStore,
            options: {
                cleanup: 'incremental',
                sourceIdKey: "source",
            },
        });

        console.log("Indexing complete!");
        console.log("Results:", indexResult);

        // Закрываем соединения
        await recordManager.end();
        await vectorStore.end();

    } catch (error) {
        console.error("Error during indexing:", error);
    }
}

// Обработка аргументов командной строки
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Error: Path to directory is required');
        console.error('Usage: npm run dev -- <path-to-directory> [namespace]');
        process.exit(1);
    }

    const dirPath = args[0];
    const namespace = args[1] || "code_index";

    console.log(`Attempting to index directory: ${dirPath}`);
    console.log(`Using namespace: ${namespace}`);

    if (!fs.existsSync(dirPath)) {
        console.error(`Directory not found: ${dirPath}`);
        process.exit(1);
    }

    await indexDirectory(dirPath, namespace);
}

// Запускаем, если запущено напрямую
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

export { indexDirectory };
