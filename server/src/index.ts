import 'dotenv/config';
import app from './app';
import { initializeSchema } from './db/schema';

async function main() {
  await initializeSchema();

  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => {
    console.log(`🚀 SignGo 服务器运行在 http://localhost:${PORT}`);
  });
}

main().catch(console.error);
