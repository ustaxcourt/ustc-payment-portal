// dotenv@18 only declares "dotenv/config" types via its `exports` map. Without this file,
// type checking will break. If we don't want this file, we would need to consider changing
// our module resolution strategy from node to bundler.
declare module "dotenv/config" {
  export {};
}
