export class FeeConfigurationError extends Error {
  constructor(
    public readonly fee: string,
    public readonly reason: string,
  ) {
    super(`Invalid fee configuration (fee='${fee}'): ${reason}`);
    this.name = "FeeConfigurationError";
  }
}
