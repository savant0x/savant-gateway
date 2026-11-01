/** Typed control flow for the identity runner; no probe text leaks through. */
export class RunCancelled extends Error {
  constructor() {
    super("The identity run was cancelled.");
    this.name = "RunCancelled";
  }
}

export class RunFailure extends Error {
  readonly errorClass: string;

  constructor(errorClass: string, message: string) {
    super(message);
    this.name = "RunFailure";
    this.errorClass = errorClass;
  }
}
