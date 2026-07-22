export class FeeNotFoundError extends Error {
  constructor(
    public readonly fee: string,
    public readonly date?: string | Date,
  ) {
    const dateDetail = date ? `, date='${date.toString()}'` : "";
    super(`No active fee found (fee='${fee}'${dateDetail})`);
    this.name = "FeeNotFoundError";
  }
}
