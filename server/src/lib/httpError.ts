// A plain Error tagged with an intended HTTP status code — lets core
// generation logic (shared between a synchronous route and the background
// job runner in routes/jobs.ts) signal "this should be a 404" / "this should
// be a 400" without depending on Express's Response object at all. The job
// runner just reads `.message`; a synchronous route can additionally read
// `.status` to preserve its original status-code behavior.
export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}
