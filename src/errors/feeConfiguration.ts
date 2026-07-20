export class FeeConfigurationError extends Error {
  constructor(public readonly fee: string) {
    super(`Fee configuration not found (fee='${fee}')`);
    this.name = "FeeConfigurationError";
  }
}
