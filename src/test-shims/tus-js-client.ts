/**
 * Test double for `tus-js-client`, wired in by the `tus-js-client` alias in
 * `vitest.config.ts`. The real package resolves to a browser build that the
 * unit-test environment cannot load, so every spec gets this instead.
 *
 * Because the alias rewrites the specifier at transform time, `vi.mock`/
 * `vi.doMock('tus-js-client')` in a spec does NOT intercept the import — this
 * module is what the code under test receives. Specs drive it through
 * `tusTestState`: replace a hook to control behaviour, read `instances` to
 * assert on the options an `Upload` was constructed with.
 *
 * Specs that call `vi.resetModules()` must re-import this module afterwards so
 * they hold the same `tusTestState` as the code under test.
 */

export interface PreviousUpload {
  uploadUrl: string;
}

export interface TusHttpRequest {
  setHeader(name: string, value: string): void;
}

/**
 * The subset of the real `UploadOptions` the app uses. `tsconfig.spec.json`
 * points `tus-js-client` here, so this is what type-checks the code under test
 * in spec builds — it must stay in step with what the service passes.
 */
export interface UploadOptions {
  endpoint?: string;
  metadata?: Record<string, string>;
  removeFingerprintOnSuccess?: boolean;
  retryDelays?: number[];
  onBeforeRequest?: (req: TusHttpRequest) => void;
  onProgress?: (bytesSent: number, bytesTotal: number) => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  [option: string]: unknown;
}

export interface TusUploadRecord {
  file: File;
  options: UploadOptions;
}

/**
 * Hooks are called through `tusTestState` at invocation time rather than
 * captured in the constructor, so a spec can swap one after the code under test
 * has already built its `Upload`.
 */
export const tusTestState = {
  instances: [] as TusUploadRecord[],
  start: (): void => undefined,
  abort: async (_retry?: boolean): Promise<void> => undefined,
  findPreviousUploads: async (): Promise<PreviousUpload[]> => [],
  resumeFromPreviousUpload: (_previousUpload: PreviousUpload): void => undefined,

  reset(): void {
    this.instances.length = 0;
    this.start = () => undefined;
    this.abort = async () => undefined;
    this.findPreviousUploads = async () => [];
    this.resumeFromPreviousUpload = () => undefined;
  },
};

export class Upload {
  public start: () => void;
  public abort: (retry?: boolean) => Promise<void>;
  public findPreviousUploads: () => Promise<PreviousUpload[]>;
  public resumeFromPreviousUpload: (previousUpload: PreviousUpload) => void;

  constructor(file: File, options: UploadOptions = {}) {
    tusTestState.instances.push({ file, options });

    this.start = () => tusTestState.start();
    this.abort = retry => tusTestState.abort(retry);
    this.findPreviousUploads = () => tusTestState.findPreviousUploads();
    this.resumeFromPreviousUpload = previousUpload =>
      tusTestState.resumeFromPreviousUpload(previousUpload);
  }
}

export default { Upload };
