export type ErrorBody = {
  error: string;
  provider?: string;
  ticker?: string;
  detail?: string;
};

export class ServiceError extends Error {
  constructor(
    public status: number,
    public body: ErrorBody,
  ) {
    super(body.detail ?? body.error);
    this.name = "ServiceError";
  }
}
