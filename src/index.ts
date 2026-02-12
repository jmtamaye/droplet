/**
 * Entry point — starts the Express server with the portfolio API.
 */

import express from 'express';
import path from 'path';
import { createDatabase } from './db/schema';
import { PortfolioService } from './services/portfolio-service';
import { createRouter } from './api/routes';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const DB_PATH = process.env.DB_PATH;

const db = createDatabase(DB_PATH);
const service = new PortfolioService(db);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', createRouter(service));

app.listen(PORT, () => {
  console.log(`Portfolio server listening on http://localhost:${PORT}`);
  console.log(`API base: http://localhost:${PORT}/api`);
  console.log(`Health:   http://localhost:${PORT}/health`);
});

export { app, service };
