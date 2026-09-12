import path from 'path';
import dotenv from 'dotenv';

// Kept as its own module and imported FIRST in server.ts: under tsx/esbuild's
// dev transform, sibling `import` statements are hoisted above plain
// statements, so a bare `dotenv.config()` call placed between two imports can
// end up running *after* modules that read `process.env` at load time
// (e.g. lib/supabase.ts). Making the config call itself the first import
// keeps it ordered correctly under both tsc (prod build) and tsx (dev).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
