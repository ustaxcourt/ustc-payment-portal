// `moduleResolution: node` ignores package `exports`, so TypeScript cannot see
// dotenv's `./config` types. Remove once tsconfig moves to node16/nodenext.
declare module "dotenv/config";
